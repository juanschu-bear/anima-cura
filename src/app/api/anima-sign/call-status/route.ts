import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { isCallAgentAuthorized } from "@/lib/anima-sign/call-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CallStatusBody = {
  submission_id?: string;
  status?: string;
  duration_seconds?: number;
};

const ALLOWED_STATUSES = new Set(["pending", "reached", "not_reached", "failed", "skipped"]);

export async function POST(request: Request) {
  if (!isCallAgentAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CallStatusBody;
  const submissionId = typeof body.submission_id === "string" ? body.submission_id.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
  const durationSeconds = Number.isFinite(body.duration_seconds)
    ? Math.max(0, Math.floor(Number(body.duration_seconds)))
    : 0;

  if (!submissionId || !status || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "submission_id oder status ungültig" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: current, error: loadError } = await supabase
    .from("anamnese_submissions")
    .select("call_attempts")
    .eq("id", submissionId)
    .single();

  if (loadError || !current) {
    return NextResponse.json({ error: loadError?.message ?? "Submission nicht gefunden" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("anamnese_submissions")
    .update({
      call_status: status,
      call_attempts: (current.call_attempts ?? 0) + 1,
      call_attempted_at: now,
      call_completed_at: now,
      call_duration_seconds: durationSeconds,
      updated_at: now,
    })
    .eq("id", submissionId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
