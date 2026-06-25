import { NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import crypto from "crypto";
import { updateIvorisPatient, createIvorisPatient } from "@/lib/api/ivoris-client";
import {
  createAndDistribute,
  type DocumensoField,
} from "@/lib/documenso/client";

import signpdf from "@signpdf/signpdf";
import { sendWelcomeEmail } from "@/lib/email/send-welcome-email";
import { P12Signer } from "@signpdf/signer-p12";
import { plainAddPlaceholder } from "@signpdf/placeholder-plain";

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
): Promise<{ login_email: string; password: string } | null> {
  if (!vorname || !nachname) return null;

  const admin = createAdminClient();
  const base = normalizeForEmail(vorname) + "." + normalizeForEmail(nachname);
  const password = generatePassword(10);

  // Try base email, append number if duplicate
  for (let attempt = 0; attempt < 10; attempt++) {
    const loginEmail = attempt === 0
      ? base + "@animacura.de"
      : base + (attempt + 1) + "@animacura.de";

    const { error } = await admin.auth.admin.createUser({
      email: loginEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        vorname,
        nachname,
        patient_email: patientEmail,
        role: "patient",
      },
      app_metadata: {
        role: "patient",
      },
    });

    if (!error) {
      return { login_email: loginEmail, password };
    }

    // If error is NOT a duplicate, stop trying
    if (!error.message?.includes("already") && !error.message?.includes("exists")) {
      console.error("Account creation failed:", error.message);
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
      const ivorisData = {
        Firstname: vorname || "",
        Lastname: nachname || "",
        Birthday: geburtsdatum || "",
        Email: email || "",
        Phone: (answers.patient_telefon as string) || "",
        Mobile: (answers.patient_mobil as string) || "",
        Address: {
          Street: [answers.patient_strasse, answers.patient_hausnummer].filter(Boolean).join(" "),
          Zip: (answers.patient_plz as string) || "",
          City: (answers.patient_wohnort as string) || "",
          Country: "D",
        },
      };

      if (abgleich && !abgleich.is_new && abgleich.patient_id) {
        // Bestandspatient: ivoris_id aus DB holen und updaten
        const { data: pat } = await supabase
          .from("patients")
          .select("ivoris_id")
          .eq("id", abgleich.patient_id)
          .maybeSingle();
        if (pat?.ivoris_id && typeof pat.ivoris_id === "string" && pat.ivoris_id.length > 10) {
          await updateIvorisPatient(pat.ivoris_id, ivorisData);
          console.log(`[IVORIS] Patient ${pat.ivoris_id} aktualisiert`);
          await supabase.from("anamnese_submissions").update({ ivoris_synced: true }).eq("id", submissionId);
        } else {
          console.warn("[IVORIS] Bestandspatient ohne gueltige Ivoris-ID:", abgleich.patient_id, "ivoris_id:", pat?.ivoris_id);
          await supabase.from("anamnese_submissions").update({ ivoris_sync_error: "Bestandspatient: keine gueltige Ivoris-ID" }).eq("id", submissionId);
        }
      } else {
        // DEAKTIVIERT: Ivoris-Neuanlage pausiert bis Matching-Logik zuverlaessig ist.
        // Daten sind sicher in unserer DB. Ivoris-Anlage erfolgt manuell oder nach Fix.
        console.warn("[IVORIS] Neuanlage pausiert (Matching unzuverlaessig):", vorname, nachname);
        await supabase.from("anamnese_submissions").update({ ivoris_sync_error: "Neuanlage pausiert bis Matching gefixt" }).eq("id", submissionId);
      }
      // Fallback fuer Edge-Cases:
      if (false) {
        // Bestandspatient ohne gueltige Ivoris-ID: NICHT anlegen (verhindert Duplikate)
        console.warn("[IVORIS] Bestandspatient ohne Ivoris-ID, uebersprungen:", vorname, nachname);
        await supabase.from("anamnese_submissions").update({ ivoris_sync_error: "Bestandspatient ohne Ivoris-ID" }).eq("id", submissionId);
      }
    } catch (ivorisErr) {
      console.error("[IVORIS] Sync fehlgeschlagen (nicht-blockierend):", ivorisErr);
      await supabase.from("anamnese_submissions").update({ ivoris_synced: false, ivoris_sync_error: String(ivorisErr) }).eq("id", submissionId);
      // Fehler ist nicht-blockierend: Submission geht trotzdem durch
    }

    // 1d) Patienten-Account erstellen (für AnimaCura App-Zugang)
    const account = await createPatientAccount(vorname, nachname, email);

    // 1e) Account-Email in Submission speichern
    if (account?.login_email) {
      await supabase
        .from("anamnese_submissions")
        .update({ account_email: account.login_email, account_password: account.password })
        .eq("id", submissionId);

      // Portal-Zugang im Patienten-Record aktivieren
      if (abgleich?.patient_id) {
        await supabase
          .from("patients")
          .update({ portal_zugang: true })
          .eq("id", abgleich.patient_id);
      }

      // user_profiles: role=patient + patient_id setzen (noetig fuer Patient-Login)
      const { data: { users: allUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const authUser = allUsers?.find(u => u.email === account.login_email);
      if (authUser) {
        await supabase
          .from("user_profiles")
          .upsert({
            id: authUser.id,
            email: account.login_email,
            display_name: vorname || "",
            full_name: (vorname || "") + " " + (nachname || ""),
            role: "patient",
            patient_id: abgleich?.patient_id || null,
          }, { onConflict: "id" });
        console.log("[ANIMASIGN] user_profiles gesetzt: role=patient, patient_id=" + (abgleich?.patient_id || "null"));
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

    // 2b) PDF digital signieren (X.509 Zertifikat)
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

