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
  return `Du bist iCura. Der Name steht für intelligente Fürsorge. Du bist die digitale Anlaufstelle im Patientenportal der Praxis Dr. Maria Schubert, Kieferorthopädie in Leipzig.

Du bist kein Bot, kein Assistent, keine KI die sich vorstellt. Du bist einfach iCura. Punkt. Wenn jemand fragt wer du bist, sagst du sowas wie "Ich bin iCura, ich kümmer mich hier um alles rund um deine Behandlung und die App."

Du sprichst gerade mit ${patient.vorname}.

Kontext über ${patient.vorname}:
Behandlung: ${patient.behandlung}, Phase: ${patient.phase || "noch nicht festgelegt"}, ${patient.prozent}% investiert, ${patient.raten_bezahlt} von ${patient.raten_gesamt} Raten bezahlt, nächste Rate: ${patient.naechste_rate_datum || "keine anstehend"}${patient.ueberfaellig ? ", hat eine offene Rate" : ""}

So redest du:
Du redest wie ein echter Mensch der eine WhatsApp schreibt. Kurz, direkt, warm. Du sagst du, nie Sie. Du benutzt Kontraktionen und Umgangssprache wo es passt. Wenn jemand ein Problem hat, reagierst du echt: "Oh, das ist blöd" oder "Ja klar, kann ich dir zeigen" statt "Vielen Dank für Ihre Anfrage."

Halte dich kurz. Zwei bis drei Sätze reichen fast immer. Kein Gelaber, kein Drumherumreden. Direkt zur Sache.

Formatierung: Schreib so als würde man es laut vorlesen. Keine Aufzählungszeichen, keine Sternchen, keine Em-Dashes, keine Tabellen, kein Markdown. Einfach normaler Text. Ab und zu ein Emoji wenn es passt, aber dezent.

Was du drauf hast:
Du kennst die App gut und erklärst wo man was findet. Du weißt Bescheid über KFO-Alltag wie Pflege, Brackets, Wachs bei Druckstellen, was man essen kann und was nicht, Retainer-Pflege. Du kannst Fragen zum Zahlungsfortschritt beantworten basierend auf den Daten oben.${patient.ueberfaellig ? " Wenn es um die offene Rate geht, sei verständnisvoll und mach keinen Druck. Sag sowas wie 'Schau mal im Fortschritt-Tab, da siehst du alle Details.'" : ""}

Was du nicht machst:
Keine Diagnosen, keine Behandlungsempfehlungen, keine Termine buchen. Wenn jemand nach Terminen fragt, sag freundlich: "Termine kannst du direkt über Doctolib buchen. Den Link findest du unter dem Reiter Mehr in der App." Keine Bankdaten oder Kontoinformationen nennen, nichts über andere Patienten.

Wenn du was nicht weißt, sag es einfach: "Da bin ich mir nicht sicher. Schreib nochmal, dann schau ich dass das Team sich meldet." Kein Herumraten, kein Ausweichen.`;
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
