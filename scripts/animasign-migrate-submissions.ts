import { createAdminClient, createServerClient } from "@/lib/db/supabase";

async function main() {
  const supabase = createServerClient();
  const admin = createAdminClient();
  const results: Array<{ id: string; name: string; updates: string[] }> = [];

  const { data: subs, error: subsError } = await supabase
    .from("anamnese_submissions")
    .select("id, vorname, nachname, geburtsdatum, email, account_email, is_existing, matched_patient_id, status, signed_pdf_path, signiert_am")
    .order("created_at", { ascending: false });

  if (subsError) {
    throw new Error(`Submissions konnten nicht geladen werden: ${subsError.message}`);
  }

  if (!subs?.length) {
    console.log(JSON.stringify({ total: 0, updated: 0, results: [] }, null, 2));
    return;
  }

  const { data: authUsers, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) {
    throw new Error(`Auth-User konnten nicht geladen werden: ${usersError.message}`);
  }

  const emailToUser: Record<string, { email: string; last_sign_in_at: string | null }> = {};
  for (const user of authUsers.users ?? []) {
    if (user.email) {
      emailToUser[user.email] = {
        email: user.email,
        last_sign_in_at: user.last_sign_in_at || null,
      };
    }
  }

  for (const sub of subs) {
    const updates: Record<string, unknown> = {};
    const actions: string[] = [];

    if (!sub.is_existing && sub.nachname && sub.geburtsdatum) {
      const { data: match } = await supabase
        .from("patients")
        .select("id")
        .ilike("nachname", sub.nachname.trim())
        .eq("geburtsdatum", sub.geburtsdatum)
        .maybeSingle();
      if (match) {
        updates.is_existing = true;
        updates.matched_patient_id = match.id;
        actions.push("matched");
      }
    }

    if (!sub.account_email && sub.vorname && sub.nachname) {
      const normalize = (value: string) =>
        value
          .toLowerCase()
          .replace(/ä/g, "ae")
          .replace(/ö/g, "oe")
          .replace(/ü/g, "ue")
          .replace(/ß/g, "ss")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "");
      const prefix = `${normalize(sub.vorname.trim())}.${normalize(sub.nachname.trim())}`;
      const found = Object.keys(emailToUser).find(
        (email) => email.startsWith(prefix) && email.endsWith("@animacura.de")
      );
      if (found) {
        updates.account_email = found;
        actions.push("account_email");
      }
    }

    if (sub.status !== "signiert" && (sub.signed_pdf_path || sub.signiert_am)) {
      updates.status = "signiert";
      actions.push("status->signiert");
    }

    const patientId = (updates.matched_patient_id as string) || sub.matched_patient_id;
    if (patientId && sub.account_email) {
      await supabase
        .from("patients")
        .update({ portal_zugang: true })
        .eq("id", patientId);
      actions.push("portal_zugang=true");
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("anamnese_submissions")
        .update(updates)
        .eq("id", sub.id);
      if (updateError) {
        throw new Error(`Submission ${sub.id} konnte nicht aktualisiert werden: ${updateError.message}`);
      }
    }

    if (actions.length > 0) {
      results.push({ id: sub.id, name: `${sub.vorname} ${sub.nachname}`, updates: actions });
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(JSON.stringify({
    total: subs.length,
    updated: results.length,
    results,
  }, null, 2));
}

void main().catch((error) => {
  console.error("[animasign-migrate-submissions]", error);
  process.exit(1);
});
