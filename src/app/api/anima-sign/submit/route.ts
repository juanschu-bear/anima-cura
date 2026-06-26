import { NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import crypto from "crypto";
import {
  createAndDistribute,
  type DocumensoField,
} from "@/lib/documenso/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SubmitBody = {
  patientId?: string | null;
  answers?: Record<string, unknown>;
  schema?: { meds?: unknown; consents?: unknown } | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function normalizeForEmail(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/\.{2,}/g, ".");
}

function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
}

async function createPatientAccount(
  vorname: string | null,
  nachname: string | null,
  patientEmail: string | null,
  patientId: string | null,
): Promise<{ login_email: string; password: string; user_id: string } | null> {
  if (!vorname || !nachname) return null;

  const admin = createAdminClient();
  const base = normalizeForEmail(vorname) + "." + normalizeForEmail(nachname);
  const password = generatePassword(10);

  // Try base email, append number if duplicate
  for (let attempt = 0; attempt < 10; attempt++) {
    const loginEmail = attempt === 0
      ? base + "@animacura.de"
      : base + (attempt + 1) + "@animacura.de";

    const { data: authData, error } = await admin.auth.admin.createUser({
      email: loginEmail,
      password: password,
      email_confirm: true,
      app_metadata: {
        role: "patient",
      },
      user_metadata: {
        display_name: `${vorname} ${nachname}`,
        full_name: `${vorname} ${nachname}`,
        vorname,
        nachname,
        patient_email: patientEmail,
        role: "patient",
        patient_id: patientId,
      },
    });

    if (!error && authData.user) {
      const profilePayload = {
        id: authData.user.id,
        email: loginEmail,
        display_name: `${vorname} ${nachname}`,
        full_name: `${vorname} ${nachname}`,
        role: "patient",
        patient_id: patientId,
      };

      const { error: profileError } = await admin
        .from("user_profiles")
        .upsert(profilePayload, { onConflict: "id" });

      if (profileError) {
        console.error("Patient profile linkage failed:", profileError.message);
      }

      return { login_email: loginEmail, password, user_id: authData.user.id };
    }

    // If error is NOT a duplicate, stop trying
    const errorMessage = error?.message ?? "Unbekannter Fehler";
    if (!errorMessage.includes("already") && !errorMessage.includes("exists")) {
      console.error("Account creation failed:", errorMessage);
      return null;
    }
    // Duplicate: try next number
  }

  console.error("Account creation: 10 attempts exhausted");
  return null;
}

// Seitenzahl aus dem PDF zaehlen (WeasyPrint liefert klassische Seitenobjekte).
function countPdfPages(pdf: Buffer): number {
  try {
    const text = pdf.toString("latin1");
    const matches = text.match(/\/Type\s*\/Page(?![s])/g);
    const n = matches ? matches.length : 0;
    return n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubmitBody;
    const answers = body.answers;

    if (!answers || typeof answers !== "object") {
      return NextResponse.json(
        { ok: false, error: "answers fehlt oder ist ungültig" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const patientId =
      typeof body.patientId === "string" && UUID_RE.test(body.patientId)
        ? body.patientId
        : null;

    const vorname = asString(answers["patient_vorname"]);
    const nachname = asString(answers["patient_nachname"]);
    const email = asString(answers["patient_email"]);
    const geburtsdatum = asString(answers["patient_geburtsdatum"]);

    // 1) Einreichung speichern
    const { data: sub, error: insertError } = await supabase
      .from("anamnese_submissions")
      .insert({
        patient_id: patientId,
        vorname,
        nachname,
        email,
        geburtsdatum,
        answers,
        status: "offen",
      })
      .select("id")
      .single();

    if (insertError || !sub) {
      return NextResponse.json(
        {
          ok: false,
          error: `Speichern fehlgeschlagen: ${insertError?.message ?? "unbekannt"}`,
        },
        { status: 500 }
      );
    }

    const submissionId = sub.id as string;

    // 1b) Bestandspatienten-Abgleich: prüfen ob Patient existiert, Daten updaten
    const { data: abgleich } = await supabase.rpc(
      "abgleich_patient_aus_submission",
      { p_submission_id: submissionId }
    );

    // 1c) Patienten-Account erstellen (für AnimaCura App-Zugang)
    const { data: linkedSubmission } = await supabase
      .from("anamnese_submissions")
      .select("patient_id")
      .eq("id", submissionId)
      .single();

    const linkedPatientId =
      typeof linkedSubmission?.patient_id === "string" && UUID_RE.test(linkedSubmission.patient_id)
        ? linkedSubmission.patient_id
        : patientId;

    const account = await createPatientAccount(vorname, nachname, email, linkedPatientId);

    // 2) PDF beim PDF-Dienst rendern lassen
    const pdfBaseUrl = process.env.ANIMASIGN_PDF_URL;
    const pdfKey = process.env.ANIMASIGN_PDF_KEY;

    if (!pdfBaseUrl || !pdfKey) {
      await supabase
        .from("anamnese_submissions")
        .update({
          status: "fehler",
          fehler_text: "ANIMASIGN_PDF_URL oder ANIMASIGN_PDF_KEY fehlt",
        })
        .eq("id", submissionId);
      return NextResponse.json(
        { ok: false, id: submissionId, error: "PDF-Dienst nicht konfiguriert" },
        { status: 500 }
      );
    }

    const dateipart = (nachname ?? submissionId).replace(
      /[^A-Za-z0-9\u00C0-\u017F_-]/g,
      "_"
    );
    const pdfFilename = `Anamnesebogen_${dateipart}.pdf`;

    let pdfBuffer: Buffer;
    try {
      const pdfResponse = await fetch(`${pdfBaseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": pdfKey,
        },
        body: JSON.stringify({
          answers,
          schema: body.schema ?? null,
          filename: pdfFilename,
        }),
      });

      if (!pdfResponse.ok) {
        throw new Error(`PDF-Dienst antwortete mit ${pdfResponse.status}`);
      }

      pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    } catch (pdfError) {
      await supabase
        .from("anamnese_submissions")
        .update({ status: "fehler", fehler_text: `PDF: ${String(pdfError)}` })
        .eq("id", submissionId);
      return NextResponse.json(
        {
          ok: false,
          id: submissionId,
          error: `PDF-Erzeugung fehlgeschlagen: ${String(pdfError)}`,
        },
        { status: 502 }
      );
    }

    // 3) Unsigniertes PDF im Storage ablegen (unser Beleg + Vorlage fuer Documenso)
    const unsignedPath = `${submissionId}/Anamnesebogen.pdf`;
    await supabase.storage
      .from("anamnese-dokumente")
      .upload(unsignedPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    // 4) Documenso-Envelope anlegen, verteilen, Signier-Link holen
    const patientName =
      [vorname, nachname].filter(Boolean).join(" ").trim() || "Patient";
    const lastPage = countPdfPages(pdfBuffer);
    const fields: DocumensoField[] = [
      { type: "SIGNATURE", page: lastPage, positionX: 8, positionY: 80, width: 38, height: 9 },
      { type: "DATE", page: lastPage, positionX: 55, positionY: 82, width: 28, height: 5 },
    ];

    try {
      const signing = await createAndDistribute({
        title: `Anamnesebogen ${patientName}`.trim(),
        externalId: submissionId,
        recipient: { email: email ?? "", name: patientName },
        fields,
        pdf: pdfBuffer,
        pdfFilename,
        language: "de",
      });

      await supabase
        .from("anamnese_submissions")
        .update({
          status: "signatur_ausstehend",
          documenso_envelope_id: signing.envelopeId,
          documenso_recipient_token: signing.token,
        })
        .eq("id", submissionId);

      // Host fuer die Einbettung (Basis ohne /api/v2), damit der Client weiss,
      // welche Documenso-Instanz das Signier-Fenster laedt.
      const documensoHost = (process.env.DOCUMENSO_BASE_URL ?? "")
        .trim()
        .replace(/\/+$/, "")
        .replace(/\/api\/v2$/, "");

      return NextResponse.json({
        ok: true,
        id: submissionId,
        token: signing.token,
        host: documensoHost,
        abgleich: abgleich ?? null,
        account: account ?? null,
      });
    } catch (documensoError) {
      // Daten sind gespeichert. Ohne Signier-Link faellt das Frontend auf die
      // Eingangsbestaetigung zurueck, die Praxis kann die Signatur nachholen.
      await supabase
        .from("anamnese_submissions")
        .update({
          status: "fehler",
          fehler_text: `Documenso: ${String(documensoError)}`,
        })
        .eq("id", submissionId);

      return NextResponse.json(
        {
          ok: false,
          id: submissionId,
          error: `Signaturanforderung fehlgeschlagen: ${String(documensoError)}`,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
