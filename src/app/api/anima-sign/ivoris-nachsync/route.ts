import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    status: "DEAKTIVIERT",
    message: "Ivoris-Nachsync ist voruebergehend deaktiviert (Duplikat-Schutz). Bitte kontaktiere Juan.",
  }, { status: 403 });
}
