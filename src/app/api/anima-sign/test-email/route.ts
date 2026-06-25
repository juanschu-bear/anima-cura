import { NextResponse } from "next/server";
import { buildWelcomeEmail } from "@/lib/email/animasign-welcome";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const to = searchParams.get("to");
  if (!to) return NextResponse.json({ error: "?to=email fehlt" }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ANIMASIGN_EMAIL_FROM;
  if (!apiKey || !from) return NextResponse.json({ error: "RESEND nicht konfiguriert" }, { status: 500 });

  const { subject, html } = buildWelcomeEmail({
    vorname: "Juan",
    welcomeUrl: "https://animacura.io/welcome/test-preview",
    lang: "de",
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });

  const data = await res.json();
  return NextResponse.json({ status: res.ok ? "GESENDET" : "FEHLER", to, data });
}
