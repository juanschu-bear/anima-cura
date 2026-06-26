import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

/**
 * POST /api/anima-sign/call-status
 * Called by the Pipecat agent after each call attempt.
 * Body: { submission_id, status: "reached"|"voicemail"|"not_reached", duration_seconds, transcript? }
 */
export async function POST(req: Request) {
  const token = req.headers.get("x-api-token");
  if (token !== process.env.CALL_AGENT_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { submission_id, status, duration_seconds, transcript } = body;

  if (!submission_id || !status) {
    return NextResponse.json({ error: "submission_id and status required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: current } = await supabase
    .from("anamnese_submissions")
    .select("call_attempts")
    .eq("id", submission_id)
    .single();

  const { error } = await supabase
    .from("anamnese_submissions")
    .update({
      call_status: status,
      last_call_at: new Date().toISOString(),
      call_attempts: (current?.call_attempts || 0) + 1,
    })
    .eq("id", submission_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[CallAgent] ${submission_id}: ${status} (${duration_seconds}s)`);
  return NextResponse.json({ ok: true, status });
}
