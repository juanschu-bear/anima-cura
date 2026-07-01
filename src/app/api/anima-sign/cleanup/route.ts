import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { createServerComponentClient } from "@/lib/db/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authClient = createServerComponentClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Nur fuer Admins" }, { status: 403 });
  }

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
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  for (const sub of testSubs) {
    // Delete auth account if exists
    if (sub.account_email) {
      const user = users?.find(u => u.email === sub.account_email);
      if (user) {
        await supabase.auth.admin.deleteUser(user.id);
        results.push({ name: `${sub.vorname} ${sub.nachname}`, action: `Auth-User ${sub.account_email} geloescht` });
      }

      const { error: profileDeleteError } = await supabase
        .from("user_profiles")
        .delete()
        .eq("email", sub.account_email);
      if (!profileDeleteError) {
        results.push({ name: `${sub.vorname} ${sub.nachname}`, action: `user_profiles fuer ${sub.account_email} bereinigt` });
      }
    }

    const storagePaths = [`${sub.id}/Anamnesebogen.pdf`, `${sub.id}/Anamnesebogen-signiert.pdf`];
    const { error: storageError } = await supabase.storage
      .from("anamnese-dokumente")
      .remove(storagePaths);
    if (!storageError) {
      results.push({ name: `${sub.vorname} ${sub.nachname}`, action: "Storage-Dateien geloescht" });
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
