import { NextResponse } from "next/server";
import { requirePraxisRole } from "@/lib/require-praxis";

export async function POST() {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  return NextResponse.json({
    status: "DEAKTIVIERT",
    message: "Ivoris-Nachsync ist voruebergehend deaktiviert (Duplikat-Schutz). Bitte kontaktiere Juan.",
  }, { status: 403 });
}
