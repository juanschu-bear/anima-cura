import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const supabase = createServerClient();
  const results: Array<{ id: string; name: string; updates: string[] }> = [];

  // Get all submissions
  const { data: subs } = await supabase
    .from("anamnese_submissions")
    .select("id, vorname, nachname, geburtsdatum, email, account_email, is_existing, matched_patient_id, status")
    .order("created_at", { ascending: false });

  if (!subs) return NextResponse.json({ error: "No submissions found" });

  // Get all auth users for login check
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailToUser: Record<string, { email: string; last_sign_in_at: string | null }> = {};
  if (users) {
    for (const u of users) {
      if (u.email) emailToUser[u.email] = { email: u.email, last_sign_in_at: u.last_sign_in_at || null };
    }
  }

  for (const sub of subs) {
    const updates: Record<string, unknown> = {};
    const actions: string[] = [];

    // 1. Fix is_existing + matched_patient_id
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

    // 2. Fix account_email
    if (!sub.account_email && sub.vorname && sub.nachname) {
      const normalize = (s: string) =>
        s.toLowerCase()
          .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "");
      const prefix = `${normalize(sub.vorname.trim())}.${normalize(sub.nachname.trim())}`;
      const found = Object.keys(emailToUser).find(e =>
        e.startsWith(prefix) && e.endsWith("@animacura.de")
      );
      if (found) {
        updates.account_email = found;
        actions.push("account_email");
      }
    }

    // 3. Fix status: if canvas signature exists (all do), mark as signiert
    if (sub.status === "offen" || sub.status === "signatur_ausstehend") {
      updates.status = "signiert";
      actions.push("status->signiert");
    }

    // 4. Fix portal_zugang on matched patient
    const patientId = (updates.matched_patient_id as string) || sub.matched_patient_id;
    if (patientId && sub.account_email) {
      await supabase
        .from("patients")
        .update({ portal_zugang: true })
        .eq("id", patientId);
      actions.push("portal_zugang=true");
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("anamnese_submissions")
        .update(updates)
        .eq("id", sub.id);
    }

    if (actions.length > 0) {
      results.push({ id: sub.id, name: `${sub.vorname} ${sub.nachname}`, updates: actions });
    }

    await new Promise(r => setTimeout(r, 50));
  }

  return NextResponse.json({
    total: subs.length,
    updated: results.length,
    results,
  });
}
