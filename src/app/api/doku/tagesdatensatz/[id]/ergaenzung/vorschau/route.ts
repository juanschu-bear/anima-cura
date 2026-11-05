import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { previewNewDayPart } from "@/lib/scribe-day-record-service";
import { dayRouteError, requireScribeDayWriter } from "@/lib/scribe-day-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const db = createServerComponentClient();
  try {
    await requireScribeDayWriter(db);
    return NextResponse.json(await previewNewDayPart(db, params.id, await request.json()));
  } catch (error) {
    return dayRouteError(error);
  }
}
