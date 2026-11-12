import { createHash, randomBytes } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";
import { sendEmail } from "@/lib/services/email-send";

const TTL_DAYS = 14;
const NEXT = "/patient/portal?section=rechnungen";

export const normalizeContactEmail = (value: string) => value.trim().toLowerCase();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const locale = (value: unknown): "de" | "en" | "es" => value === "en" || value === "es" ? value : "de";

type ContactPatient = { id: string; vorname: string; nachname: string; geburtsdatum: string; email: string | null };

async function contactPatients(db: ReturnType<typeof createServerClient>, email: string) {
  const { data, error } = await db.from("patients").select("id,vorname,nachname,geburtsdatum,email").ilike("email", email);
  if (error) throw new Error("invoice_access_patient_lookup_failed");
  return (data ?? []) as ContactPatient[];
}

async function findOrCreateUser(db: ReturnType<typeof createServerClient>, email: string) {
  const users = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error("invoice_access_auth_lookup_failed");
  const found = users.data.users.find(user => user.email?.toLowerCase() === email);
  if (found) return { user: found, created: false };
  const created = await db.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    app_metadata: { role: "patient", invoice_contact_access: true },
    user_metadata: { role: "patient", invoice_contact_access: true },
  });
  if (created.error || !created.data.user) throw new Error("invoice_access_auth_create_failed");
  return { user: created.data.user, created: true };
}

export async function requestInvoiceAccess(input: { email: string; next?: string; language?: string; ip?: string }) {
  const db = createServerClient();
  const email = normalizeContactEmail(input.email);
  const patients = await contactPatients(db, email);
  // The response remains identical for unknown addresses.
  if (!patients.length) return { ok: true, expiresInDays: TTL_DAYS };

  let contact = (await db.from("invoice_access_contacts").select("id,locale,auth_user_id").eq("normalized_email", email).maybeSingle()).data as { id: string; locale: string; auth_user_id: string | null } | null;
  if (!contact) {
    const inserted = await db.from("invoice_access_contacts").insert({ email, normalized_email: email, locale: locale(input.language) }).select("id,locale,auth_user_id").single();
    if (inserted.error || !inserted.data) throw new Error("invoice_access_contact_create_failed");
    contact = inserted.data;
  }
  await db.from("invoice_access_contact_patients").upsert(patients.map(patient => ({ contact_id: contact!.id, patient_id: patient.id })), { onConflict: "contact_id,patient_id" });
  const token = randomBytes(32).toString("base64url");
  await db.from("invoice_access_links").insert({ contact_id: contact.id, token_hash: hashToken(token), next_path: input.next === NEXT ? NEXT : NEXT, locale: locale(input.language), expires_at: new Date(Date.now() + TTL_DAYS * 86400000).toISOString() });
  return { ok: true, expiresInDays: TTL_DAYS, accessToken: token, email, contactId: contact.id };
}

export async function resendInvoiceAccess(token: string) {
  const db = createServerClient();
  const row = (await db.from("invoice_access_links").select("contact_id,locale").eq("token_hash", hashToken(token)).maybeSingle()).data;
  if (row?.contact_id) {
    const contact = (await db.from("invoice_access_contacts").select("email,locale").eq("id", row.contact_id).single()).data;
    if (contact) {
      const result = await requestInvoiceAccess({ email: contact.email, language: contact.locale });
      if (result.accessToken) {
        const url = `https://animacura.io/patient/invoice-access/continue?token=${encodeURIComponent(result.accessToken)}&lang=${encodeURIComponent(contact.locale)}`;
        const sent = await sendEmail({ to: contact.email, subject: "Dein neuer Zugang zu den Rechnungen", body: `<p>Hier ist dein neuer persönlicher Zugang zu den Rechnungen:</p><p><a href="${url}">Rechnungen öffnen</a></p><p>Der Link ist 14 Tage gültig und kann nur einmal verwendet werden.</p>`, track: false, idempotencyKey: `invoice-access-resend-${hashToken(token)}` });
        if (sent.ok) await db.from("invoice_access_events").insert({ contact_id: row.contact_id, event: "mail_sent" });
      }
      return { ok: true, expiresInDays: TTL_DAYS };
    }
  }
  return { ok: true, expiresInDays: TTL_DAYS };
}

export async function confirmInvoiceAccess(input: { token: string; birthDate: string; password: string }) {
  if (input.password.length < 8) return { ok: false as const, code: "password_invalid" };
  const db = createServerClient();
  const link = (await db.from("invoice_access_links").select("id,contact_id,expires_at,consumed_at,locale").eq("token_hash", hashToken(input.token)).maybeSingle()).data as { id: string; contact_id: string; expires_at: string; consumed_at: string | null; locale: string } | null;
  if (!link) return { ok: false as const, code: "access_link_invalid" };
  if (link.consumed_at || Date.parse(link.expires_at) <= Date.now()) return { ok: false as const, code: "access_link_expired" };
  const members = (await db.from("invoice_access_contact_patients").select("patient_id,patients(id,vorname,nachname,geburtsdatum)").eq("contact_id", link.contact_id)).data ?? [];
  const matching = members.find((row: any) => row.patients?.geburtsdatum === input.birthDate);
  if (!matching) return { ok: false as const, code: "birth_date_mismatch" };
  const contact = (await db.from("invoice_access_contacts").select("email,auth_user_id").eq("id", link.contact_id).single()).data as { email: string; auth_user_id: string | null };
  let userId = contact.auth_user_id;
  let createdUser = false;
  if (!userId) {
    const created = await findOrCreateUser(db, contact.email);
    userId = created.user.id;
    createdUser = created.created;
    await db.from("invoice_access_contacts").update({ auth_user_id: userId, updated_at: new Date().toISOString() }).eq("id", link.contact_id);
  }
  if (!createdUser) {
    const existingMembership = await db.from("patient_access_memberships").select("patient_id").eq("user_id", userId).limit(1);
    if ((existingMembership.data ?? []).length || contact.auth_user_id) return { ok: false as const, code: "access_exists" };
  }
  const updated = await db.auth.admin.updateUserById(userId, { password: input.password, email_confirm: true, user_metadata: { role: "patient", invoice_contact_access: true } });
  if (updated.error) return { ok: false as const, code: "access_unavailable" };
  const patientRows = members.map((row: any) => ({ user_id: userId, patient_id: row.patient_id, contact_id: link.contact_id }));
  await db.from("patient_access_memberships").upsert(patientRows, { onConflict: "user_id,patient_id" });
  const first = Array.isArray(matching.patients) ? matching.patients[0] : matching.patients;
  await db.from("user_profiles").upsert({ id: userId, email: contact.email, display_name: first ? `${first.vorname} ${first.nachname}` : contact.email, role: "patient", patient_id: first?.id ?? null }, { onConflict: "id" });
  const consumed = await db.from("invoice_access_links").update({ consumed_at: new Date().toISOString(), consumed_user_id: userId }).eq("id", link.id).is("consumed_at", null).gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
  if (!consumed.data) return { ok: false as const, code: "access_link_expired" };
  await db.from("invoice_access_events").insert([{ contact_id: link.contact_id, link_id: link.id, event: "link_consumed" }, { contact_id: link.contact_id, link_id: link.id, event: "access_created" }]);
  return { ok: true as const, userId, loginEmail: contact.email, children: members.map((row: any) => ({ patientId: row.patient_id, firstName: row.patients?.vorname ?? "", lastName: row.patients?.nachname ?? "", status: row.patient_id === first?.id ? "linked" : "linked" })), redirect: NEXT };
}

export async function accessChildren(userId: string) {
  const db = createServerClient();
  const rows = (await db.from("patient_access_memberships").select("patient_id,patients(id,vorname,nachname)").eq("user_id", userId)).data ?? [];
  return rows.map((row: any) => ({ patientId: row.patient_id, firstName: row.patients?.vorname ?? "", lastName: row.patients?.nachname ?? "" }));
}

export async function mergeInvoiceAccess(input: { token: string; birthDate: string; userId: string }) {
  const db = createServerClient();
  const link = (await db.from("invoice_access_links").select("id,contact_id,expires_at,consumed_at").eq("token_hash", hashToken(input.token)).maybeSingle()).data as { id: string; contact_id: string; expires_at: string; consumed_at: string | null } | null;
  if (!link || link.consumed_at || Date.parse(link.expires_at) <= Date.now()) return { ok: false as const, code: "access_link_expired" };
  const contact = (await db.from("invoice_access_contacts").select("email").eq("id", link.contact_id).single()).data as { email: string } | null;
  const users = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = users.data?.users.find(candidate => candidate.id === input.userId);
  if (!contact || !user || user.email?.toLowerCase() !== contact.email.toLowerCase()) return { ok: false as const, code: "access_merge_requires_same_email" };
  const members = (await db.from("invoice_access_contact_patients").select("patient_id,patients(geburtsdatum)").eq("contact_id", link.contact_id)).data ?? [];
  if (!(members as any[]).some(row => row.patients?.geburtsdatum === input.birthDate || row.patients?.[0]?.geburtsdatum === input.birthDate)) return { ok: false as const, code: "birth_date_mismatch" };
  await db.from("patient_access_memberships").upsert((members as any[]).map(row => ({ user_id: input.userId, patient_id: row.patient_id, contact_id: link.contact_id })), { onConflict: "user_id,patient_id" });
  await db.from("invoice_access_links").update({ consumed_at: new Date().toISOString(), consumed_user_id: input.userId }).eq("id", link.id).is("consumed_at", null);
  return { ok: true as const, children: await accessChildren(input.userId), redirect: NEXT };
}
