import { createHash, randomBytes } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";
import { sendEmail } from "@/lib/services/email-send";
import { buildInvoiceAccessLinkEmail } from "@/lib/email/invoice-access-link";

const TTL_DAYS = 14;
const NEXT = "/patient/portal?section=rechnungen";

export const normalizeContactEmail = (value: string) => value.trim().toLowerCase();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const locale = (value: unknown): "de" | "en" | "es" => value === "en" || value === "es" ? value : "de";

type ContactPatient = { id: string; vorname: string; nachname: string; geburtsdatum: string; email: string | null };

// LIKE-Platzhalter in der Adresse wörtlich nehmen (ein „_“ in einer Mailadresse ist kein Joker).
export const likeLiteral = (value: string) => value.replace(/[\\%_]/g, char => `\\${char}`);

/**
 * Patienten zu einer Mailadresse. Gleiche Regel wie die Empfängerliste im Leitstand: Groß-/Kleinschreibung und
 * Leerzeichen, Tabs oder geschützte Leerzeichen vor und nach der Adresse zählen nicht. Die Datenbank sucht grob
 * (enthält die Adresse), der genaue Vergleich passiert danach hier.
 */
export const contactEmailMatches = (stored: string | null | undefined, normalized: string) => normalizeContactEmail(stored ?? "") === normalized;

async function contactPatients(db: ReturnType<typeof createServerClient>, email: string) {
  const { data, error } = await db.from("patients").select("id,vorname,nachname,geburtsdatum,email").ilike("email", `%${likeLiteral(email)}%`);
  if (error) throw new Error("invoice_access_patient_lookup_failed");
  return ((data ?? []) as ContactPatient[]).filter(patient => contactEmailMatches(patient.email, email));
}

async function findExistingUser(db: ReturnType<typeof createServerClient>, email: string) {
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const result = await db.auth.admin.listUsers({ page, perPage });
    if (result.error) throw new Error("invoice_access_auth_lookup_failed");
    const found = result.data.users.find(user => user.email?.toLowerCase() === email);
    if (found) return found;
    if (result.data.users.length < perPage) break;
  }
  return null;
}

async function createContactUser(db: ReturnType<typeof createServerClient>, email: string, password: string) {
  const found = await findExistingUser(db, email);
  if (found) return { user: found, created: false };
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "patient", invoice_contact_access: true },
    user_metadata: { role: "patient", invoice_contact_access: true },
  });
  if (created.error || !created.data.user) throw new Error("invoice_access_auth_create_failed");
  return { user: created.data.user, created: true };
}

export async function requestInvoiceAccess(input: { email: string; next?: string; language?: string; ip?: string; deliver?: boolean; trustedWorker?: boolean }) {
  const db = createServerClient();
  const email = normalizeContactEmail(input.email);
  const ipHash = input.ip ? hashToken(input.ip.split(",")[0].trim()) : null;
  if (ipHash && !input.trustedWorker) {
    const recentIp = await db.from("invoice_access_request_log").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gt("requested_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
    if ((recentIp.count ?? 0) >= 20) return { ok: true, expiresInDays: TTL_DAYS, rateLimited: true };
    await db.from("invoice_access_request_log").insert({ ip_hash: ipHash });
  }
  const patients = await contactPatients(db, email);
  // The response remains identical for unknown addresses.
  if (!patients.length) return { ok: true, expiresInDays: TTL_DAYS };

  let contact = (await db.from("invoice_access_contacts").select("id,locale,auth_user_id").eq("normalized_email", email).maybeSingle()).data as { id: string; locale: string; auth_user_id: string | null } | null;
  if (!contact) {
    const inserted = await db.from("invoice_access_contacts").insert({ email, normalized_email: email, locale: locale(input.language) }).select("id,locale,auth_user_id").single();
    if (inserted.error || !inserted.data) throw new Error("invoice_access_contact_create_failed");
    contact = inserted.data;
  }
  const recent = input.trustedWorker ? null : await db.from("invoice_access_links").select("id", { count: "exact", head: true }).eq("contact_id", contact.id).gt("requested_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if ((recent?.count ?? 0) >= 3) return { ok: true, expiresInDays: TTL_DAYS, rateLimited: true };
  await db.from("invoice_access_contact_patients").upsert(patients.map(patient => ({ contact_id: contact!.id, patient_id: patient.id })), { onConflict: "contact_id,patient_id" });
  const token = randomBytes(32).toString("base64url");
  await db.from("invoice_access_links").insert({ contact_id: contact.id, token_hash: hashToken(token), next_path: input.next === NEXT ? NEXT : NEXT, locale: locale(input.language), expires_at: new Date(Date.now() + TTL_DAYS * 86400000).toISOString() });
  const result = { ok: true as const, expiresInDays: TTL_DAYS, accessToken: token, email, contactId: contact.id };
  if (input.deliver) {
    const url = `https://animacura.io/patient/invoice-access/continue?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(locale(input.language))}`;
    const mail = buildInvoiceAccessLinkEmail(url, locale(input.language));
    const sent = await sendEmail({ to: email, subject: mail.subject, body: mail.html, track: false, idempotencyKey: `invoice-access-${hashToken(token)}` });
    if (sent.ok) await db.from("invoice_access_events").insert({ contact_id: contact.id, event: "mail_sent" });
  }
  return result;
}

export async function resendInvoiceAccess(token: string) {
  const db = createServerClient();
  const row = (await db.from("invoice_access_links").select("contact_id,locale").eq("token_hash", hashToken(token)).maybeSingle()).data;
  if (row?.contact_id) {
    const contact = (await db.from("invoice_access_contacts").select("email,locale").eq("id", row.contact_id).single()).data;
    if (contact) {
      await requestInvoiceAccess({ email: contact.email, language: contact.locale, deliver: true });
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
  const attempts = await db.from("invoice_access_attempts").select("id", { count: "exact", head: true }).eq("link_id", link.id).gt("attempted_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if ((attempts.count ?? 0) >= 5) return { ok: false as const, code: "rate_limited" };
  await db.from("invoice_access_attempts").insert({ link_id: link.id });
  const members = (await db.from("invoice_access_contact_patients").select("patient_id,patients(id,vorname,nachname,geburtsdatum)").eq("contact_id", link.contact_id)).data ?? [];
  const matching = members.find((row: any) => row.patients?.geburtsdatum === input.birthDate);
  if (!matching) return { ok: false as const, code: "birth_date_mismatch" };
  const contact = (await db.from("invoice_access_contacts").select("email,auth_user_id").eq("id", link.contact_id).single()).data as { email: string; auth_user_id: string | null };
  if (contact.auth_user_id || await findExistingUser(db, contact.email)) return { ok: false as const, code: "access_exists" };
  const created = await createContactUser(db, contact.email, input.password);
  if (!created.created) return { ok: false as const, code: "access_exists" };
  const userId = created.user.id;
  const first = Array.isArray(matching.patients) ? matching.patients[0] : matching.patients;
  try {
    const patientRows = members.map((row: any) => ({ user_id: userId, patient_id: row.patient_id, contact_id: link.contact_id }));
    const memberships = await db.from("patient_access_memberships").upsert(patientRows, { onConflict: "user_id,patient_id" });
    const profile = await db.from("user_profiles").upsert({ id: userId, email: contact.email, display_name: first ? `${first.vorname} ${first.nachname}` : contact.email, role: "patient", patient_id: first?.id ?? null }, { onConflict: "id" });
    if (memberships.error || profile.error) throw new Error("access_unavailable");
    const linked = await db.from("invoice_access_contacts").update({ auth_user_id: userId, updated_at: new Date().toISOString() }).eq("id", link.contact_id).is("auth_user_id", null).select("id").maybeSingle();
    if (!linked.data) throw new Error("access_exists");
  } catch (error) {
    await db.from("patient_access_memberships").delete().eq("user_id", userId);
    await db.from("user_profiles").delete().eq("id", userId);
    await db.auth.admin.deleteUser(userId);
    if (error instanceof Error && error.message === "access_exists") return { ok: false as const, code: "access_exists" };
    return { ok: false as const, code: "access_unavailable" };
  }
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
