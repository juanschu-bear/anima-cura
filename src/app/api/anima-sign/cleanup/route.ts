import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export async function GET(req: Request) {
  const supabase = createServerClient();
  const { searchParams } = new URL(req.url);
  const confirm = searchParams.get("confirm") === "true";

  // Everything before June 22, 2026 is test data
  const cutoff = "2026-06-22T00:00:00.000Z";

  // Find test submissions
  const { data: testSubs } = await supabase
    .from("anamnese_submissions")
    .select("id, vorname, nachname, created_at, account_email")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (!testSubs || testSubs.length === 0) {
    return NextResponse.json({ message: "Keine Testdaten gefunden." });
  }

  // Preview mode (default)
  if (!confirm) {
    return NextResponse.json({
      mode: "PREVIEW - nichts geloescht. Rufe mit ?confirm=true auf um zu loeschen.",
      cutoff,
      count: testSubs.length,
      entries: testSubs.map(s => ({
        id: s.id,
        name: `${s.vorname || "null"} ${s.nachname || "null"}`,
        date: s.created_at,
        account: s.account_email || "kein Account",
      })),
    });
  }

  // Delete mode
  const results: Array<{ name: string; action: string }> = [];

  for (const sub of testSubs) {
    // Delete auth account if exists
    if (sub.account_email) {
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const user = users?.find(u => u.email === sub.account_email);
      if (user) {
        await supabase.auth.admin.deleteUser(user.id);
        results.push({ name: `${sub.vorname} ${sub.nachname}`, action: `Auth-User ${sub.account_email} geloescht` });
      }
    }

    // Delete submission
    await supabase
      .from("anamnese_submissions")
      .delete()
      .eq("id", sub.id);

    results.push({ name: `${sub.vorname} ${sub.nachname}`, action: "Submission geloescht" });
  }

  return NextResponse.json({
    mode: "GELOESCHT",
    count: testSubs.length,
    results,
  });
}
