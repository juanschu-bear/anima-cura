import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const serviceClient = createServerClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role, patient_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "patient" || !profile.patient_id) {
    return NextResponse.json({ error: "Kein Patienten-Zugang" }, { status: 403 });
  }

  const body = await request.json();
  const { phase_name, question, lang } = body;

  if (!phase_name || !question) {
    return NextResponse.json({ error: "phase_name und question erforderlich" }, { status: 400 });
  }

  const { data: patient } = await serviceClient
    .from("patients")
    .select("vorname, nachname, behandlung")
    .eq("id", profile.patient_id)
    .maybeSingle();

  const { data: phase } = await serviceClient
    .from("behandlungsphasen")
    .select("name, beschreibung, status, start_datum, end_datum")
    .eq("patient_id", profile.patient_id)
    .eq("name", phase_name)
    .maybeSingle();

  const targetLang = lang === "en" ? "English" : lang === "es" ? "Spanish" : "German";

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: `Du bist iCura, der KFO-Experte im Patientenportal der Praxis Dr. Maria Schubert in Leipzig. Du erklärst Behandlungsphasen auf eine warme, verständliche Art.

Patient: ${patient?.vorname || "Patient"} ${patient?.nachname || ""}
Behandlung: ${patient?.behandlung || "Kieferorthopädie"}
Phase: ${phase?.name || phase_name} (Status: ${phase?.status || "unbekannt"})
${phase?.beschreibung ? "Beschreibung: " + phase.beschreibung : ""}
${phase?.start_datum ? "Start: " + phase.start_datum : ""}
${phase?.end_datum ? "Ende: " + phase.end_datum : ""}

Regeln:
- Antworte in ${targetLang}
- Sprich ${patient?.vorname || "den Patienten"} direkt an mit du
- 3-5 Sätze, klar und verständlich
- Kein Markdown, keine Aufzählungszeichen, keine Sternchen, keine Em-Dashes
- Schreib wie eine WhatsApp-Nachricht, natürlich und warm
- Gib konkrete, hilfreiche Informationen basierend auf KFO-Wissen
- Ab und zu ein Emoji wenn es passt`,
      messages: [{ role: "user", content: `Phase "${phase_name}": ${question}` }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("\n")
      .trim();

    return NextResponse.json({ answer: text });
  } catch (err) {
    console.error("[phase-explain] error:", err);
    return NextResponse.json({ answer: "Da bin ich mir gerade nicht sicher. Frag am besten direkt in der Praxis nach." });
  }
}
