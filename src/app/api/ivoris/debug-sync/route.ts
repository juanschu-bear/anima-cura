import { NextResponse } from "next/server";
import { fetchIvorisPatientsRaw } from "@/lib/api/ivoris-client";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await fetchIvorisPatientsRaw();
    const isArray = Array.isArray(data);
    return NextResponse.json({
      ok: true,
      isArray,
      length: isArray ? data.length : null,
      type: typeof data,
      preview: JSON.stringify(data).slice(0, 300),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: String(error),
    });
  }
}
