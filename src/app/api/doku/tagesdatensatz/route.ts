import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { bootstrapDayRecord, findDayRecord } from "@/lib/scribe-day-record-service";
import { dayRouteError, requireScribeDayWriter } from "@/lib/scribe-day-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const db = createServerComponentClient();
  try {
    await requireScribeDayWriter(db);
    return NextResponse.json(await findDayRecord(
      db,
      request.nextUrl.searchParams.get("patient_id") ?? "",
      request.nextUrl.searchParams.get("termin_datum") ?? "",
    ));
  } catch (error) {
    return dayRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  const db = createServerComponentClient();
  try {
    await requireScribeDayWriter(db);
    return NextResponse.json(await bootstrapDayRecord(db, await request.json()), { status: 201 });
  } catch (error) {
    return dayRouteError(error);
  }
}
