import { NextResponse } from "next/server";
import { fetchIvorisDocumentation } from "@/lib/api/ivoris-client";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const documentation = await fetchIvorisDocumentation();
    return NextResponse.json({ ok: true, documentation });
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
