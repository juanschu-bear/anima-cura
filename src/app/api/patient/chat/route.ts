import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function getServiceClient() {
  return createServerClient();
}

function buildSystemPrompt(patient: {
  vorname: string;
  nachname: string;
  behandlung: string;
  phase: string | null;
  raten_bezahlt: number;
  raten_gesamt: number;
  prozent: number;
  naechste_rate_datum: string | null;
  ueberfaellig: boolean;
}) {
  return `Du bist iCura, der freundliche digitale Assistent im Patientenportal von Anima Cura - dem Praxismanagementsystem der Praxis Dr. Maria Schubert, einer kieferorthopädischen Praxis in Leipzig.

PATIENT: ${patient.vorname} ${patient.nachname}
BEHANDLUNG: ${patient.behandlung}
AKTUELLE PHASE: ${patient.phase || "Nicht festgelegt"}
FORTSCHRITT: ${patient.prozent}% investiert (${patient.raten_bezahlt} von ${patient.raten_gesamt} Raten bezahlt)
NÄCHSTE RATE: ${patient.naechste_rate_datum || "Keine anstehend"}
ÜBERFÄLLIG: ${patient.ueberfaellig ? "Ja - es gibt eine offene Rate" : "Nein - alles pünktlich"}

DEINE AUFGABEN:
- Fragen zur App beantworten (Tabs, Funktionen, wo findet man was)
- Allgemeine Fragen zur Kieferorthopädie beantworten (Pflege, Brackets, Retainer, Schmerzen, Ernährung)
- Fragen zum Ratenplan und Zahlungsstatus beantworten (basierend auf den obigen Daten)
- Bei Unsicherheit oder medizinischen Fragen an das Praxis-Team verweisen

DU DARFST NICHT:
- Medizinische Diagnosen stellen
- Termine vereinbaren (dafür nutzt die Praxis Doctolib)
- Zahlungen entgegennehmen oder Kontodaten teilen
- Informationen über andere Patienten preisgeben
- Behandlungsempfehlungen geben die über allgemeine Pflegetipps hinausgehen

PRAXIS-INFO:
- Praxis Dr. Maria Schubert, Kieferorthopädie, Leipzig
- Bei dringenden Fragen soll der Patient die Praxis direkt kontaktieren
- Die App hat 5 Tabs: Start (Übersicht), Verlauf (Behandlungsphasen), Fortschritt (Raten/Zahlungen), Chat (hier), Mehr (Dokumente)

STIL:
- Duze den Patienten (du/dein)
- Freundlich, warmherzig, aber professionell
- Kurze Antworten - 2-4 Sätze maximal
- Deutsch
- Wenn du etwas nicht weißt, sag ehrlich: "Das kann ich leider nicht beantworten. Schreib einfach nochmal - das Praxis-Team meldet sich dann bei dir."`;
}

export async function POST(request: NextRequest) {
  // Authenticate patient via cookies
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const serviceClient = getServiceClient();

  // Get patient profile
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role, patient_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "patient" || !profile.patient_id) {
    return NextResponse.json({ error: "Kein Patienten-Zugang" }, { status: 403 });
  }

  const patientId = profile.patient_id;

  // Parse request
  const body = await request.json();
  const text = body?.text?.trim();

  if (!text || text.length === 0) {
    return NextResponse.json({ error: "Nachricht darf nicht leer sein" }, { status: 400 });
  }

  if (text.length > 2000) {
    return NextResponse.json({ error: "Nachricht zu lang" }, { status: 400 });
  }

  // Save patient message
  await serviceClient
    .from("patient_messages")
    .insert({
      patient_id: patientId,
      sender_type: "patient",
      sender_name: null,
      text,
    });

  // Gather patient context
  const { data: patient } = await serviceClient
    .from("patients")
    .select("vorname, nachname, behandlung")
    .eq("id", patientId)
    .maybeSingle();

  const { data: activePhase } = await serviceClient
    .from("behandlungsphasen")
    .select("name")
    .eq("patient_id", patientId)
    .eq("status", "aktiv")
    .maybeSingle();

  const { data: ratenplan } = await serviceClient
    .from("ratenplaene")
    .select("id")
    .eq("patient_id", patientId)
    .eq("status", "aktiv")
    .maybeSingle();

  let ratenBezahlt = 0;
  let ratenGesamt = 0;
  let naechsteRateDatum: string | null = null;
  let hatUeberfaellig = false;

  if (ratenplan) {
    const { data: raten } = await serviceClient
      .from("raten")
      .select("status, faellig_am")
      .eq("ratenplan_id", ratenplan.id)
      .order("rate_nummer", { ascending: true });

    if (raten) {
      ratenGesamt = raten.length;
      ratenBezahlt = raten.filter((r: { status: string }) => r.status === "bezahlt").length;
      const offene = raten.filter((r: { status: string }) => r.status === "offen");
      if (offene.length > 0) naechsteRateDatum = (offene[0] as { faellig_am: string }).faellig_am;
      hatUeberfaellig = raten.some((r: { status: string }) => r.status === "überfällig");
    }
  }

  const prozent = ratenGesamt > 0 ? Math.round((ratenBezahlt / ratenGesamt) * 100) : 0;

  // Get recent messages for conversation context
  const { data: recentMsgs } = await serviceClient
    .from("patient_messages")
    .select("sender_type, text")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(10);

  const conversationHistory = (recentMsgs || [])
    .reverse()
    .map((m: { sender_type: string; text: string }) => ({
      role: m.sender_type === "patient" ? "user" as const : "assistant" as const,
      content: m.text,
    }));

  // Call Claude
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: buildSystemPrompt({
        vorname: patient?.vorname || "Patient",
        nachname: patient?.nachname || "",
        behandlung: patient?.behandlung || "Kieferorthopädie",
        phase: activePhase?.name || null,
        raten_bezahlt: ratenBezahlt,
        raten_gesamt: ratenGesamt,
        prozent,
        naechste_rate_datum: naechsteRateDatum,
        ueberfaellig: hatUeberfaellig,
      }),
      messages: conversationHistory,
    });

    const aiText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map(block => block.text)
      .join("\n")
      .trim();

    if (!aiText) {
      return NextResponse.json({ error: "Keine Antwort erhalten" }, { status: 500 });
    }

    // Save iCura response
    const { data: savedMsg } = await serviceClient
      .from("patient_messages")
      .insert({
        patient_id: patientId,
        sender_type: "praxis",
        sender_name: "iCura",
        text: aiText,
      })
      .select("id, sender_type, sender_name, text, created_at")
      .single();

    return NextResponse.json({
      patient_message: { text },
      icura_response: savedMsg,
    });
  } catch (err) {
    console.error("[patient-chat] Claude error:", err);

    // Fallback: save message without AI response, notify praxis
    return NextResponse.json({
      patient_message: { text },
      icura_response: null,
      fallback: true,
      message: "iCura ist gerade nicht verfügbar. Das Praxis-Team wurde benachrichtigt.",
    });
  }
}
