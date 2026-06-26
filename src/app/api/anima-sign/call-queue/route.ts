import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

/**
 * GET /api/anima-sign/call-queue
 * Returns patients who:
 * 1. Submitted their form 60+ minutes ago
 * 2. Have an account but never logged in
 * 3. Have a phone number
 * 4. Haven't been called yet (or last call was 2h+ ago and unsuccessful)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = req.headers.get("x-api-token");
  if (token !== process.env.CALL_AGENT_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Get submissions with accounts but no login, 60+ min old
  const { data: submissions } = await supabase
    .from("anamnese_submissions")
    .select(`
      id, vorname, nachname, account_email, answers,
      matched_patient_id,
      call_status, last_call_at
    `)
    .not("account_email", "is", null)
    .lt("created_at", sixtyMinAgo)
    .or("call_status.is.null,call_status.eq.not_reached");

  if (!submissions?.length) {
    return NextResponse.json({ queue: [], count: 0 });
  }

  // Check which ones have actually logged in
  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const loggedInEmails = new Set(
    users?.users?.filter(u => u.last_sign_in_at).map(u => u.email) || []
  );

  // Filter: not logged in, has phone, not called recently
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const queue = submissions
    .filter(s => !loggedInEmails.has(s.account_email))
    .filter(s => {
      if (!s.last_call_at) return true;
      return s.call_status === "not_reached" && s.last_call_at < twoHoursAgo;
    })
    .map(s => {
      const answers = s.answers as Record<string, string> || {};
      return {
        submission_id: s.id,
        vorname: s.vorname,
        nachname: s.nachname,
        phone: answers.telefon || answers.phone || "",
        lang: answers.sprache || "de",
        account_email: s.account_email,
      };
    })
    .filter(s => s.phone);

  return NextResponse.json({ queue, count: queue.length });
}
