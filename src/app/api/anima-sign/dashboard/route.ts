import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { isManualReviewErrorText, stripManualReviewPrefix } from "@/lib/services/animasign-sync-status";

export async function GET(req: Request) {
  const supabase = createServerClient();
  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter") || "today";
  const search = searchParams.get("search") || "";

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  // Submissions query
  let query = supabase
    .from("anamnese_submissions")
    .select("id, vorname, nachname, email, created_at, status, is_existing, matched_patient_id, account_email, ivoris_synced, ivoris_sync_error, ivoris_doc_synced, ivoris_sync_failed_permanently, ivoris_doc_failed_permanently")
    .order("created_at", { ascending: false });

  if (filter === "today") query = query.gte("created_at", todayStart.toISOString());
  else if (filter === "week") query = query.gte("created_at", weekStart.toISOString());
  else if (filter === "open") query = query.in("status", ["offen", "signatur_ausstehend"]);

  if (search.trim().length >= 2) {
    query = query.or(`nachname.ilike.%${search.trim()}%,vorname.ilike.%${search.trim()}%`);
  }

  const { data: submissions } = await query.limit(200);

  // Stats
  const [
    { count: total },
    { count: today },
    { count: matched },
    { count: pendingSig },
    { count: regs },
  ] = await Promise.all([
    supabase.from("anamnese_submissions").select("*", { count: "exact", head: true }),
    supabase.from("anamnese_submissions").select("*", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
    supabase.from("anamnese_submissions").select("*", { count: "exact", head: true }).eq("is_existing", true),
    supabase.from("anamnese_submissions").select("*", { count: "exact", head: true }).in("status", ["offen", "signatur_ausstehend"]),
    supabase.from("anamnese_submissions").select("*", { count: "exact", head: true }).not("account_email", "is", null),
  ]);

  // Get login status for all accounts with @animacura.de emails
  const loginMap: Record<string, string | null> = {};
  try {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (users) {
      for (const u of users) {
        if (u.email?.endsWith("@animacura.de")) {
          loginMap[u.email] = u.last_sign_in_at || null;
        }
      }
    }
  } catch (e) {
    console.error("[AnimaSign API] Auth listUsers failed:", e);
  }

  // Enrich submissions with login status
  const enriched = (submissions || []).map(s => ({
    ...s,
    has_logged_in: s.account_email ? !!loginMap[s.account_email] : false,
    last_login: s.account_email ? loginMap[s.account_email] || null : null,
    ivoris_manual_review:
      isManualReviewErrorText(s.ivoris_sync_error) ||
      s.ivoris_sync_failed_permanently === true ||
      s.ivoris_doc_failed_permanently === true,
    ivoris_manual_review_reason: stripManualReviewPrefix(s.ivoris_sync_error),
  }));

  // Count actual logins
  const loggedInCount = enriched.filter(s => s.has_logged_in).length;

  return NextResponse.json({
    submissions: enriched,
    stats: {
      total: total || 0,
      today: today || 0,
      matched: matched || 0,
      pendingSignatures: pendingSig || 0,
      registrations: regs || 0,
      loggedIn: loggedInCount,
    },
  });
}
