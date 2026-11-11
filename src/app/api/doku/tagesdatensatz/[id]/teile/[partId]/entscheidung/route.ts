import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { decideStoredDayPart } from "@/lib/scribe-day-record-service";
import { dayRouteError, requireScribeDayWriter } from "@/lib/scribe-day-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string; partId: string } }) {
  const db = createServerComponentClient();
  try {
    const actor=await requireScribeDayWriter(db);
    return NextResponse.json(await decideStoredDayPart(db, params.id, params.partId, await request.json(),{
      id:actor.user.id,name:actor.profile.display_name||actor.initials,
    }));
  } catch (error) {
    return dayRouteError(error);
  }
}
