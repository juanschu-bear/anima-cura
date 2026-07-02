import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Dedicated patient-sync cron. ivoris offers no "changed since" endpoint for
// patients, so this runs the full batch-sync via the existing route. Scheduled
// in vercel.json at 04/07/10/13/16 UTC (= 06/09/12/15/18 German summer time,
// one hour earlier in winter). Auth mirrors /api/cron (Bearer CRON_SECRET).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.EXT_PUBLIC_APP_URL ||
    "https://anima-cura.vercel.app";

  let startPage = 0;
  let fetched = 0;
  let upserted = 0;
  let skipped = 0;
  let done = false;
  const errors: string[] = [];

  // Continue through batches until the sync route reports done. Safety cap 50.
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${appUrl}/api/ivoris/patients/batch-sync?startPage=${startPage}`, {
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
      if (Array.isArray(json.errors)) errors.push(...json.errors);
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
    success: true,
    results: { fetched, upserted, skipped, done },
    errors: errors.slice(0, 20),
    duration_ms: Date.now() - startTime,
  });
}
