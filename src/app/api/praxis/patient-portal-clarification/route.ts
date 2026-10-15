import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";
import { CLARIFICATION_AUTH_SETTING, patientPortalClarificationStatus, sendPatientPortalClarificationBatch } from "@/lib/services/patient-portal-clarification-campaign";

export const dynamic = "force-dynamic";
const inputSchema = z.object({ action: z.enum(["status", "send"]), limit: z.number().int().min(1).max(20).optional() }).strict();

async function authorized(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const result = await createServerClient().from("einstellungen").select("value").eq("key", CLARIFICATION_AUTH_SETTING).maybeSingle();
  const value = result.data?.value as { tokenHash?: string; expiresAt?: string } | null;
  if (!token || !value?.tokenHash || !value.expiresAt || Date.parse(value.expiresAt) < Date.now()) return false;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"));
  const expected = Buffer.from(value.tokenHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: NextRequest) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  return NextResponse.json(await patientPortalClarificationStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  const result = parsed.data.action === "status" ? await patientPortalClarificationStatus() : await sendPatientPortalClarificationBatch(parsed.data.limit ?? 10);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
