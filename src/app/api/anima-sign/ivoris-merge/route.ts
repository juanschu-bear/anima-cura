import { NextResponse } from "next/server";
import { updateIvorisPatient, fetchIvorisPatientById } from "@/lib/api/ivoris-client";

export const runtime = "nodejs";

export async function GET() {
  // Test with just ONE patient to see the full error
  const origId = "c6c7e9e0-136c-49b6-b441-c69f96894dc2"; // Lisa Werkmeister

  // First, fetch the original patient to see what fields Ivoris expects
  let original: unknown;
  try {
    original = await fetchIvorisPatientById(origId);
  } catch (e) {
    return NextResponse.json({ error: "Fetch failed: " + String(e) });
  }

  // Now try the update
  let updateError: string | null = null;
  try {
    await updateIvorisPatient(origId, {
      Email: "lisa_werkmeister@icloud.com",
      Phone: "01759951117",
      Mobile: "01759951117",
    });
  } catch (e) {
    updateError = String(e);
  }

  return NextResponse.json({
    originalPatient: original,
    updateError,
  });
}
