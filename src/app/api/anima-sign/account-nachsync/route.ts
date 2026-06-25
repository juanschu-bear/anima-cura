import { NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import crypto from "crypto";

function normalizeForEmail(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, (c) => {
    const map: Record<string, string> = { "ae": "ae", "\u00e4": "ae", "\u00f6": "oe", "\u00fc": "ue", "\u00df": "ss", "\u00e9": "e", "\u00e8": "e", "\u00ea": "e", "\u00e1": "a", "\u00e0": "a", "\u00f1": "n", "\u00ed": "i", "\u00f3": "o", "\u00fa": "u" };
    return map[c] || "";
  });
}

function generatePassword(len: number): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789#!@";
  return Array.from(crypto.randomBytes(len)).map(b => chars[b % chars.length]).join("");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("confirm") !== "true") {
    return NextResponse.json({ error: "Add ?confirm=true to execute" });
  }

  const supabase = createServerClient();
  const admin = createAdminClient();

  // Find all submissions without accounts
  const { data: missing } = await supabase
    .from("anamnese_submissions")
    .select("id, vorname, nachname, email, matched_patient_id")
    .is("account_email", null)
    .not("email", "is", null)
    .order("created_at", { ascending: true });

  if (!missing?.length) {
    return NextResponse.json({ message: "Keine fehlenden Accounts", count: 0 });
  }

  const results: { name: string; email: string; status: string }[] = [];

  for (const sub of missing) {
    if (!sub.vorname || !sub.nachname) {
      results.push({ name: `${sub.vorname} ${sub.nachname}`, email: "", status: "SKIP: kein Name" });
      continue;
    }

    const base = normalizeForEmail(sub.vorname) + "." + normalizeForEmail(sub.nachname);
    const password = generatePassword(10);
    let loginEmail = "";
    let created = false;

    for (let attempt = 0; attempt < 10; attempt++) {
      loginEmail = attempt === 0 ? base + "@animacura.de" : base + (attempt + 1) + "@animacura.de";
      const { error } = await admin.auth.admin.createUser({
        email: loginEmail,
        password,
        email_confirm: true,
        user_metadata: { vorname: sub.vorname, nachname: sub.nachname, patient_email: sub.email, role: "patient" },
        app_metadata: { role: "patient" },
      });

      if (!error) {
        created = true;
        break;
      }
      if (!error.message?.includes("already") && !error.message?.includes("exists")) {
        results.push({ name: `${sub.vorname} ${sub.nachname}`, email: loginEmail, status: `ERROR: ${error.message}` });
        break;
      }
    }

    if (created) {
      await supabase.from("anamnese_submissions").update({ account_email: loginEmail, account_password: password }).eq("id", sub.id);
      if (sub.matched_patient_id) {
        await supabase.from("patients").update({ portal_zugang: true }).eq("id", sub.matched_patient_id);
      }
      results.push({ name: `${sub.vorname} ${sub.nachname}`, email: loginEmail, status: "OK" });
    }
  }

  return NextResponse.json({ results, total: missing.length, created: results.filter(r => r.status === "OK").length });
}
