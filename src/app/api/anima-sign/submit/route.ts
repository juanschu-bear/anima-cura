import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { syncAnimaSignSubmission } from "@/lib/services/animasign-ivoris-sync";
import { ensurePatientPortalAccount } from "@/lib/services/patient-portal-account";
import {
  createAndDistribute,
  type DocumensoField,
} from "@/lib/documenso/client";

import signpdf from "@signpdf/signpdf";
import { sendWelcomeEmail } from "@/lib/email/send-welcome-email";
import { P12Signer } from "@signpdf/signer-p12";
import { plainAddPlaceholder } from "@signpdf/placeholder-plain";
import { appendReservedSignaturePage } from "@/lib/animasign/pdf-layout";

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

type VersichertenPatch = {
  versicherter_vorname?: string;
  versicherter_nachname?: string;
  versicherter_geburtsdatum?: string;
  versicherter_strasse?: string;
  versicherter_plz?: string;
  versicherter_ort?: string;
  versicherter_telefon?: string;
  versicherter_email?: string;
  eb2_vorname?: string;
  eb2_nachname?: string;
  eb2_telefon?: string;
  eb2_email?: string;
  versicherungsart?: string;
  krankenkasse?: string;
  zusatzversicherung?: string;
};

function normalizeVersicherungsart(value: string | null): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.includes("gesetzlich")) return "gesetzlich";
  if (v.includes("privat")) return "privat";
  if (v.includes("beihilfe")) return "beihilfe";
  if (v.includes("selbstzahler")) return "selbstzahler";
  return value;
}

// Baut aus den Anamnesebogen-Antworten die lokalen Versichertenfelder.
// Nur vorhandene Werte werden gesetzt, damit ein Re-Sync bestehende Daten nicht leert.
function buildVersichertenPatch(answers: Record<string, unknown>): VersichertenPatch {
  const patch: VersichertenPatch = {};
  const set = (key: keyof VersichertenPatch, value: string | null): void => {
    if (value !== null) patch[key] = value;
  };

  set("versicherter_vorname", asString(answers["vp_vorname"]));
  set("versicherter_nachname", asString(answers["vp_nachname"]));
  set("versicherter_geburtsdatum", asString(answers["vp_geburtsdatum"]));

  const strasse = asString(answers["vp_strasse"]);
  const hausnummer = asString(answers["vp_hausnummer"]);
  const adresse = [strasse, hausnummer].filter((p): p is string => p !== null).join(" ").trim();
  if (adresse !== "") patch.versicherter_strasse = adresse;

  set("versicherter_plz", asString(answers["vp_plz"]));
  set("versicherter_ort", asString(answers["vp_wohnort"]));
  set("versicherter_telefon", asString(answers["vp_telefon"]));
  set("versicherter_email", asString(answers["vp_email"]));

  set("eb2_vorname", asString(answers["vp2_vorname"]));
  set("eb2_nachname", asString(answers["vp2_nachname"]));
  set("eb2_telefon", asString(answers["vp2_telefon"]));
  set("eb2_email", asString(answers["vp2_email"]));

  set("versicherungsart", normalizeVersicherungsart(asString(answers["versicherungsart"])));
  set("krankenkasse", asString(answers["krankenkasse"]));
  set("zusatzversicherung", asString(answers["zusatzversicherung"]));

  return patch;
}

function scheduleFastRetryAt() {
  return new Date(Date.now() + 5 * 60_000).toISOString();
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
        status: "signiert",
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

    // 1b-store) Abgleich-Ergebnis in Submission speichern
    if (abgleich) {
      await supabase
        .from("anamnese_submissions")
        .update({
          is_existing: !abgleich.is_new,
          matched_patient_id: abgleich.patient_id || null,
        })
        .eq("id", submissionId);
    }

    // 1c) Ivoris-Sync: Patientendaten sofort zu Ivoris pushen
    try {
      const syncResult = await syncAnimaSignSubmission(submissionId, {
        db: supabase,
        stages: ["patient"],
        stageOverrides: {
          patient: {
            attemptNo: 0,
            retryCountOnFailure: 0,
          },
        },
      });
      console.log("[IVORIS] submit sync result:", syncResult);
      if (syncResult.patient === "error") {
        const errorText =
          syncResult.errors.join(" | ").slice(0, 1000) ||
          "Initialer Ivoris-Patientensync fehlgeschlagen";
        await supabase
          .from("anamnese_submissions")
          .update({
            ivoris_sync_error: errorText,
            ivoris_sync_retry_count: 0,
            ivoris_sync_next_retry_at: scheduleFastRetryAt(),
            ivoris_sync_failed_permanently: false,
          })
          .eq("id", submissionId);
      }
    } catch (ivorisErr) {
      console.error("[IVORIS] Sync fehlgeschlagen (nicht-blockierend):", ivorisErr);
      await supabase
        .from("anamnese_submissions")
        .update({
          ivoris_sync_error:
            ivorisErr instanceof Error ? ivorisErr.message : String(ivorisErr),
          ivoris_sync_retry_count: 0,
          ivoris_sync_next_retry_at: scheduleFastRetryAt(),
          ivoris_sync_failed_permanently: false,
        })
        .eq("id", submissionId);
      // Fehler ist nicht-blockierend: Submission geht trotzdem durch
    }

    // 1d) Patienten-Account erstellen (für AnimaCura App-Zugang)
    const resolvedPatientId = abgleich?.patient_id || patientId;
    const account = await ensurePatientPortalAccount({
      vorname,
      nachname,
      patientEmail: email,
      patientId: resolvedPatientId || null,
    });

    // 1e) Account-Email in Submission speichern
    if (account.status === "created" || account.status === "existing") {
      await supabase
        .from("anamnese_submissions")
        .update({
          account_email: account.login_email,
          ...(account.status === "created" ? { account_password: account.password } : {}),
        })
        .eq("id", submissionId);

      // Portal-Zugang und Versichertendaten aus dem Anamnesebogen im Patienten-Record setzen
      if (resolvedPatientId) {
        await supabase
          .from("patients")
          .update({ portal_zugang: true, ...buildVersichertenPatch(answers) })
          .eq("id", resolvedPatientId);
      }

      // Willkommens-Email senden (nicht-blockierend)
      if (email && vorname) {
        const welcomeUrl = `https://animacura.io/welcome/${submissionId}`;
        void sendWelcomeEmail({
          to: email,
          vorname: vorname,
          welcomeUrl,
          lang: ((answers?.sprache as string) === "en" || (answers?.sprache as string) === "es" || (answers?.sprache as string) === "ru" || (answers?.sprache as string) === "tr") ? (answers.sprache as "en" | "es" | "ru" | "tr") : "de",
        }).catch(err => console.error("[AnimaSign] Welcome email failed:", err));
      }
    }

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

    const patientName =
      [vorname, nachname].filter(Boolean).join(" ").trim() || "Patient";

    // 2b) Feste Abschlussseite anhaengen, damit Datum und Unterschrift nie im Formular landen.
    const preparedPdf = await appendReservedSignaturePage(pdfBuffer, patientName);
    pdfBuffer = preparedPdf.pdfBuffer;

    // 2c) PDF digital signieren (X.509 Zertifikat)
    const certBase64 = process.env.PDF_SIGNING_CERT;
    const certPass = process.env.PDF_SIGNING_PASSPHRASE;
    if (certBase64 && certPass) {
      try {
        const certBuffer = Buffer.from(certBase64, "base64");
        const pdfWithPlaceholder = plainAddPlaceholder({
          pdfBuffer,
          reason: "Anamnesebogen digital signiert",
          contactInfo: "praxis@praxis-schubert.de",
          name: "AnimaSign / KFO-Praxis Dr. Maria Elena Schubert",
          location: "Leipzig, Deutschland",
        });
        const signer = new P12Signer(certBuffer, { passphrase: certPass });
        const signedResult = await signpdf.sign(pdfWithPlaceholder, signer);
        pdfBuffer = Buffer.from(signedResult);
        console.log("[ANIMASIGN] PDF erfolgreich digital signiert");
      } catch (signError) {
        console.error("[ANIMASIGN] PDF-Signierung fehlgeschlagen (nicht-blockierend):", signError);
        // Nicht-blockierend: unsigniertes PDF wird trotzdem gespeichert
      }
    } else {
      console.warn("[ANIMASIGN] PDF_SIGNING_CERT oder PDF_SIGNING_PASSPHRASE fehlt, PDF wird unsigniert gespeichert");
    }

    // 3) Signiertes PDF im Storage ablegen
    const unsignedPath = `${submissionId}/Anamnesebogen.pdf`;
    await supabase.storage
      .from("anamnese-dokumente")
      .upload(unsignedPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    // 4) Documenso-Envelope anlegen, verteilen, Signier-Link holen
    const fields: DocumensoField[] = [
      { type: "SIGNATURE", page: preparedPdf.signaturePage, positionX: 8, positionY: 64, width: 84, height: 12 },
      { type: "DATE", page: preparedPdf.signaturePage, positionX: 58, positionY: 77, width: 24, height: 5 },
    ];

    try {
      const welcomeUrl = `https://animacura.io/welcome/${submissionId}`;
      const signing = await createAndDistribute({
        title: `Anamnesebogen ${patientName}`.trim(),
        externalId: submissionId,
        recipient: { email: email ?? "", name: patientName },
        fields,
        pdf: pdfBuffer,
        pdfFilename,
        language: "de",
      }, {
        redirectUrl: welcomeUrl,
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
        signingUrl: signing.signingUrl,
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
