import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const supabase = createServerClient();
  const results: Array<{ id: string; name: string; updates: Record<string, unknown> }> = [];

  // Get all submissions that haven't been backfilled yet
  const { data: subs } = await supabase
    .from("anamnese_submissions")
    .select("id, vorname, nachname, geburtsdatum, email, account_email, is_existing, ivoris_synced")
    .order("created_at", { ascending: false });

  if (!subs) return NextResponse.json({ error: "No submissions found" });

  for (const sub of subs) {
    const updates: Record<string, unknown> = {};

    // 1. Check if patient was matched (is_existing)
    if (!sub.is_existing && sub.nachname && sub.geburtsdatum) {
      const { data: match } = await supabase
        .from("patients")
        .select("id")
        .ilike("nachname", sub.nachname)
        .eq("geburtsdatum", sub.geburtsdatum)
        .maybeSingle();

      if (match) {
        updates.is_existing = true;
        updates.matched_patient_id = match.id;
      }
    }

    // 2. Check if account was created (look for @animacura.de user)
    if (!sub.account_email && sub.vorname && sub.nachname) {
      // Normalize name for email lookup
      const normalize = (s: string) =>
        s.toLowerCase()
          .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "");
      const base = `${normalize(sub.vorname)}.${normalize(sub.nachname)}@animacura.de`;

      // Check Supabase Auth for this email (or with number suffix)
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const found = users?.find(u =>
        u.email?.startsWith(`${normalize(sub.vorname)}.${normalize(sub.nachname)}`) &&
        u.email?.endsWith("@animacura.de")
      );

      if (found?.email) {
        updates.account_email = found.email;
      }
    }

    // 3. Mark ivoris_synced based on whether the nachsync already ran
    // (We can't verify Ivoris from here, but if the nachsync ran today, those are synced)

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("anamnese_submissions")
        .update(updates)
        .eq("id", sub.id);

      results.push({ id: sub.id, name: `${sub.vorname} ${sub.nachname}`, updates });
    }

    // Small delay to not overload
    await new Promise(r => setTimeout(r, 100));
  }

  return NextResponse.json({
    total: subs.length,
    updated: results.length,
    results,
  });
}
