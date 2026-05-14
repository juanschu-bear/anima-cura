import { NextResponse } from "next/server";
import { syncIvorisPatients } from "@/lib/services/ivoris-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await syncIvorisPatients();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: String(error),
      },
      { status: 500 }
    );
  }
}
