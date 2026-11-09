import { NextRequest, NextResponse } from "next/server";
import {isPatientSyncCron,patientSyncMode} from "@/lib/services/patient-sync-schedule";

export const runtime = "nodejs";
export const maxDuration = 300;

// Every 15 minutes discover missing patients. Broad refresh retains its five daily windows.
export async function GET(req: NextRequest) {
  if (!isPatientSyncCron(req,process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const mode=patientSyncMode(new Date());
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.EXT_PUBLIC_APP_URL ||
    "https://anima-cura.vercel.app";

  let startPage = 0;
  let fetched = 0;
  let upserted = 0;
  let skipped = 0;
  let deferred = 0;
  let done = false;
  const errors: string[] = [];

  // Continue through batches until the sync route reports done. Safety cap 50.
  for (let i = 0; i < 50 && Date.now()-startTime<240000; i++) {
    try {
      const res = await fetch(`${appUrl}/api/ivoris/patients/batch-sync?startPage=${startPage}&mode=${mode}`, {
        signal:AbortSignal.timeout(Math.max(1,240000-(Date.now()-startTime))),
        headers: {
          "Cache-Control": "no-cache",
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      });
      if (!res.ok) {
        errors.push(`HTTP ${res.status} bei Seite ${startPage}`);
        break;
      }
      const json = await res.json();
      fetched += json.results?.fetched ?? 0;
      upserted += json.results?.upserted ?? 0;
      skipped += json.results?.skipped ?? 0;
      deferred += json.results?.deferred ?? 0;
      if (Array.isArray(json.errors)) errors.push(...json.errors);
      if(json.errors?.length){break;}
      if (json.done || json.nextPage === null || json.nextPage === undefined) {
        done = true;
        break;
      }
      startPage = json.nextPage;
    } catch (e) {
      errors.push(String(e));
      break;
    }
  }

  return NextResponse.json({
    success: done && errors.length===0,
    mode,
    results: { fetched, upserted, skipped, deferred, done },
    errors: errors.slice(0, 20),
    duration_ms: Date.now() - startTime,
  });
}
