import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { readDayRecord } from "@/lib/scribe-day-record-service";
import { dayRouteError, requireScribeDayWriter } from "@/lib/scribe-day-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const db = createServerComponentClient();
  try {
    await requireScribeDayWriter(db);
    return NextResponse.json(await readDayRecord(db, params.id));
  } catch (error) {
    return dayRouteError(error);
  }
}
