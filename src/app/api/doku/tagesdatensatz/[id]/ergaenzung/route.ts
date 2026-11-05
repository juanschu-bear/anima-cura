import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { saveDraftDayPart } from "@/lib/scribe-day-record-service";
import { dayRouteError, requireScribeDayWriter } from "@/lib/scribe-day-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const db = createServerComponentClient();
  try {
    await requireScribeDayWriter(db);
    const result = await saveDraftDayPart(db, params.id, await request.json(), request.headers.get("x-day-preview-token"));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return dayRouteError(error);
  }
}
