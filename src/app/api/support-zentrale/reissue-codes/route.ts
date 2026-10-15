import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePraxisRole } from "@/lib/require-praxis";
import { repairMissingSupportCodes } from "@/lib/services/support-code-repair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ send: z.boolean().default(false) });

export async function POST(request: NextRequest) {
  const denied = await requirePraxisRole(["admin"]);
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiger Nachversandauftrag." }, { status: 400 });
  try {
    return NextResponse.json(await repairMissingSupportCodes({ send: parsed.data.send }), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Die Codefälle konnten nicht ausgewertet werden." }, { status: 500 });
  }
}
