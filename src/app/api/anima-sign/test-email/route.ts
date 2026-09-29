import { NextResponse } from "next/server";
import { buildPortalActivationEmail } from "@/lib/email/portal-activation";
import { requirePraxisRole } from "@/lib/require-praxis";
import { z } from "zod";
import { previewInvitationCampaign, prepareInvitationCampaign, testInvitationCampaign, sendInvitationBatch, pauseInvitationCampaign } from "@/lib/services/portal-invitation-campaign";

export const maxDuration = 60;

// A preview/link scanner must never send email. Test sends require practice auth.
export async function GET() {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;
  try { return NextResponse.json(await previewInvitationCampaign(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Campaign preview unavailable" }, { status: 503 }); }
}

export async function POST(req: Request) {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const campaign = z.object({ action: z.enum(["prepare", "test", "send", "pause"]) }).strict().safeParse(body);
  if (campaign.success) {
    try {
      const result = campaign.data.action === "pause" ? await pauseInvitationCampaign() : campaign.data.action === "prepare" ? await prepareInvitationCampaign()
        : campaign.data.action === "test" ? await testInvitationCampaign() : await sendInvitationBatch();
      return NextResponse.json(result);
    } catch { return NextResponse.json({ error: "Campaign operation failed; review dispatch status before retrying" }, { status: 503 }); }
  }
  const parsed = z.object({ to: z.string().email(), firstName: z.string().max(80).optional(), requestId: z.string().uuid() })
    .safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid test request" }, { status: 400 });
  const { to, firstName, requestId } = parsed.data;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ANIMASIGN_EMAIL_FROM;
  if (!apiKey || !from) return NextResponse.json({ error: "RESEND nicht konfiguriert" }, { status: 500 });

  const { subject, html, text } = buildPortalActivationEmail({ firstName });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `activation-test-${requestId}` },
    body: JSON.stringify({ from, to, reply_to: "orthoschub@web.de", subject: `[TEST] ${subject}`, html, text }),
  });

  const data = await res.json();
  return NextResponse.json({ status: res.ok ? "ACCEPTED" : "FAILED", providerId: res.ok ? data.id : undefined }, { status: res.ok ? 200 : 502 });
}
