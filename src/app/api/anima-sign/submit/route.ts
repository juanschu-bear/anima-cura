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
import { buildSubmissionReplayFingerprint } from "@/lib/services/animasign-submit-idempotency";
import { classifyRecentIdentitySubmission } from "@/lib/services/animasign-submit-resume";
import {
  buildSubmissionPatientPatch,
  ensureLinkedLocalPatientForSubmission,
} from "@/lib/services/animasign-local-patient-link";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SubmitBody = {
  patientId?: string | null;
  answers?: Record<string, unknown>;
  schema?: { meds?: unknown; consents?: unknown } | null;
};

type SubmissionReplayRow = {
  id: string;
  status: string | null;
  fehler_text?: string | null;
  account_email?: string | null;
  account_password?: string | null;
  matched_patient_id?: string | null;
  patient_id?: string | null;
  documenso_envelope_id?: string | null;
  documenso_recipient_token?: string | null;
  signed_pdf_path?: string | null;
  ivoris_synced?: boolean | null;
  ivoris_doc_synced?: boolean | null;
  ivoris_patient_id?: string | null;
  ivoris_document_id?: string | null;
  ivoris_sync_retry_count?: number | null;
  ivoris_doc_retry_count?: number | null;
  ivoris_sync_next_retry_at?: string | null;
  ivoris_doc_next_retry_at?: string | null;
  ivoris_sync_failed_permanently?: boolean | null;
  ivoris_doc_failed_permanently?: boolean | null;
  ivoris_summary_synced?: boolean | null;
  ivoris_summary_synced_at?: string | null;
  ivoris_summary_hash?: string | null;
};

type SubmitIntentState = {
  fingerprint: string;
  submission_id: string | null;
  status: "pending" | "resolved";
  created_at: string;
  updated_at?: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function normalizeMatchValue(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toIsoDateOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function scheduleFastRetryAt() {
  return new Date(Date.now() + 5 * 60_000).toISOString();
}

function extractMissingColumn(message: string | null | undefined): string | null {
  if (!message) return null;
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

function documensoHost() {
  return (process.env.DOCUMENSO_BASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v2$/, "");
}

function buildSigningUrlFromToken(token: string | null | undefined) {
  const host = documensoHost();
  if (!host || !token) return null;
  return `${host}/sign/${encodeURIComponent(token)}`;
}

function submitIntentKey(fingerprint: string) {
  return `animasign_submit_intent:${fingerprint}`;
}

async function loadSubmitIntent(
  supabase: ReturnType<typeof createServerClient>,
  fingerprint: string
): Promise<SubmitIntentState | null> {
  const { data, error } = await supabase
    .from("einstellungen")
    .select("value")
    .eq("key", submitIntentKey(fingerprint))
    .maybeSingle();

  if (error) {
    throw new Error(`Submit-Intent konnte nicht geladen werden: ${error.message}`);
  }

  const value = data?.value;
  if (!value || typeof value !== "object") return null;

  const intent = value as Partial<SubmitIntentState>;
  if (intent.fingerprint !== fingerprint || typeof intent.created_at !== "string") {
    return null;
  }

  return {
    fingerprint,
    submission_id: intent.submission_id ?? null,
    status: intent.status === "resolved" ? "resolved" : "pending",
    created_at: intent.created_at,
    updated_at: intent.updated_at,
  };
}

async function reserveSubmitIntent(
  supabase: ReturnType<typeof createServerClient>,
  fingerprint: string
): Promise<{ intent: SubmitIntentState | null; created: boolean }> {
  const now = new Date().toISOString();
  let created = false;
  try {
    const { error } = await supabase.from("einstellungen").insert({
      key: submitIntentKey(fingerprint),
      value: {
        fingerprint,
        submission_id: null,
        status: "pending",
        created_at: now,
        updated_at: now,
      },
    });

    if (error && !error.message.toLowerCase().includes("duplicate")) {
      throw error;
    }
    if (!error) {
      created = true;
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes("duplicate")) {
      throw new Error(
        `Submit-Intent konnte nicht reserviert werden: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    intent: await loadSubmitIntent(supabase, fingerprint),
    created,
  };
}

async function finalizeSubmitIntent(
  supabase: ReturnType<typeof createServerClient>,
  fingerprint: string,
  submissionId: string
) {
  const current = await loadSubmitIntent(supabase, fingerprint);
  if (!current) return;

  await supabase
    .from("einstellungen")
    .update({
      value: {
        ...current,
        fingerprint,
        submission_id: submissionId,
        status: "resolved",
        updated_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("key", submitIntentKey(fingerprint));
}

async function loadReplayableSubmission(
  supabase: ReturnType<typeof createServerClient>,
  submissionId: string
): Promise<SubmissionReplayRow | null> {
  const { data, error } = await supabase
    .from("anamnese_submissions")
    .select(
      "id, status, fehler_text, account_email, account_password, matched_patient_id, patient_id, documenso_envelope_id, documenso_recipient_token, signed_pdf_path"
    )
    .eq("id", submissionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Replay-Submission konnte nicht geladen werden: ${error.message}`);
  }

  return data as SubmissionReplayRow | null;
}

function buildReplayResponse(submission: SubmissionReplayRow) {
  const signingUrl = buildSigningUrlFromToken(submission.documenso_recipient_token);
  return NextResponse.json({
    ok: true,
    replayed: true,
    id: submission.id,
    token: submission.documenso_recipient_token ?? null,
    host: documensoHost(),
    signingUrl,
    abgleich: submission.matched_patient_id || submission.patient_id
      ? {
          is_new: !submission.matched_patient_id,
          patient_id: submission.matched_patient_id ?? submission.patient_id ?? null,
        }
      : null,
    account: submission.account_email
      ? {
          status: "existing",
          login_email: submission.account_email,
          password: submission.account_password ?? null,
        }
      : null,
  });
}

async function waitForResolvedSubmitIntent(
  supabase: ReturnType<typeof createServerClient>,
  fingerprint: string
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await loadSubmitIntent(supabase, fingerprint);
    if (current?.submission_id) {
      const replay = await loadReplayableSubmission(supabase, current.submission_id);
      if (replay) return replay;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

type RecentIdentityDecision =
  | { kind: "replay"; submission: SubmissionReplayRow }
  | { kind: "resume"; submission: SubmissionReplayRow }
  | { kind: "ignore" };

async function findRecentResumableSubmission(
  supabase: ReturnType<typeof createServerClient>,
  params: {
    vorname: string | null;
    nachname: string | null;
    geburtsdatum: string | null;
  }
): Promise<RecentIdentityDecision> {
  const firstname = normalizeMatchValue(params.vorname);
  const lastname = normalizeMatchValue(params.nachname);
  const birthday = toIsoDateOrNull(params.geburtsdatum);

  if (!firstname || !lastname || !birthday) {
    return { kind: "ignore" };
  }

  const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("anamnese_submissions")
    .select(
      "id, created_at, vorname, nachname, geburtsdatum, status, fehler_text, account_email, account_password, matched_patient_id, patient_id, documenso_envelope_id, documenso_recipient_token, signed_pdf_path"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    throw new Error(`Recent-Resume-Abgleich fehlgeschlagen: ${error.message}`);
  }

  for (const row of (data ?? []) as Array<
    SubmissionReplayRow & {
      created_at?: string | null;
      vorname?: string | null;
      nachname?: string | null;
      geburtsdatum?: string | null;
    }
  >) {
    if (normalizeMatchValue(row.vorname) !== firstname) continue;
    if (normalizeMatchValue(row.nachname) !== lastname) continue;
    if (toIsoDateOrNull(row.geburtsdatum) !== birthday) continue;

    const decision = classifyRecentIdentitySubmission(row);
    if (decision === "replay") {
      return { kind: "replay", submission: row };
    }
    if (decision === "resume") {
      return { kind: "resume", submission: row };
    }
  }

  return { kind: "ignore" };
}

async function findRecentMatchingSubmission(
  supabase: ReturnType<typeof createServerClient>,
  params: {
    vorname: string | null;
    nachname: string | null;
    geburtsdatum: string | null;
    answers: Record<string, unknown>;
    email: string | null;
  }
) {
  if (!params.vorname || !params.nachname || !params.geburtsdatum) {
    return null;
  }

  const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const fingerprint = buildSubmissionReplayFingerprint({
    vorname: params.vorname,
    nachname: params.nachname,
    geburtsdatum: params.geburtsdatum,
    email: params.email,
    answers: params.answers,
  });

  const { data, error } = await supabase
    .from("anamnese_submissions")
    .select(
      "id, created_at, vorname, nachname, geburtsdatum, email, answers, status, account_email, account_password, matched_patient_id, patient_id, documenso_envelope_id, documenso_recipient_token"
    )
    .eq("vorname", params.vorname)
    .eq("nachname", params.nachname)
    .eq("geburtsdatum", params.geburtsdatum)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Recent-Submission-Abgleich fehlgeschlagen: ${error.message}`);
  }

  for (const row of data ?? []) {
    const rowFingerprint = buildSubmissionReplayFingerprint({
      vorname: row.vorname ?? null,
      nachname: row.nachname ?? null,
      geburtsdatum: row.geburtsdatum ?? null,
      email: row.email ?? null,
      answers: (row.answers as Record<string, unknown> | null) ?? {},
    });

    if (rowFingerprint === fingerprint) {
      return row as SubmissionReplayRow;
    }
  }

  return null;
}

async function insertSubmissionWithSchemaFallback(
  supabase: ReturnType<typeof createServerClient>,
  payload: Record<string, unknown>
) {
  let currentPayload = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from("anamnese_submissions")
      .insert(currentPayload)
      .select("id")
      .single();

    if (!error && data) {
      return { data, error: null as null };
    }

    const missingColumn = extractMissingColumn(error?.message);
    if (!missingColumn || !(missingColumn in currentPayload)) {
      return { data: null, error };
    }

    delete currentPayload[missingColumn];
  }

  return {
    data: null,
    error: { message: "Schema-Fallback fuer anamnese_submissions erschöpft." },
  };
}

async function updateSubmissionWithSchemaFallback(
  supabase: ReturnType<typeof createServerClient>,
  submissionId: string,
  payload: Record<string, unknown>
) {
  let currentPayload = { ...payload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase
      .from("anamnese_submissions")
      .update(currentPayload)
      .eq("id", submissionId);

    if (!error) {
      return { error: null as null };
    }

    const missingColumn = extractMissingColumn(error.message);
    if (!missingColumn || !(missingColumn in currentPayload)) {
      return { error };
    }

    delete currentPayload[missingColumn];
  }

  return {
    error: { message: "Schema-Fallback fuer anamnese_submissions update erschöpft." },
  };
}

async function updatePatientWithSchemaFallback(
  supabase: ReturnType<typeof createServerClient>,
  patientId: string,
  payload: Record<string, unknown>
) {
  let currentPayload = { ...payload };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await supabase
      .from("patients")
      .update(currentPayload)
      .eq("id", patientId);

    if (!error) {
      return { error: null as null };
    }

    const missingColumn = extractMissingColumn(error.message);
    if (!missingColumn || !(missingColumn in currentPayload)) {
      return { error };
    }

    delete currentPayload[missingColumn];
  }

  return {
    error: { message: "Schema-Fallback fuer patients erschöpft." },
  };
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
    const replayFingerprint =
      vorname && nachname && geburtsdatum
        ? buildSubmissionReplayFingerprint({
            vorname,
            nachname,
            geburtsdatum,
            email,
            answers,
          })
        : null;

    if (replayFingerprint) {
      const existingIntent = await loadSubmitIntent(supabase, replayFingerprint);
      if (existingIntent?.submission_id) {
        const replay = await loadReplayableSubmission(
          supabase,
          existingIntent.submission_id
        );
        if (replay) {
          return buildReplayResponse(replay);
        }
      }

      if (existingIntent?.status === "pending") {
        const replay = await waitForResolvedSubmitIntent(supabase, replayFingerprint);
        if (replay) {
          return buildReplayResponse(replay);
        }
      } else {
        const reservation = await reserveSubmitIntent(supabase, replayFingerprint);
        if (!reservation.created && reservation.intent?.status === "pending") {
          const replay = await waitForResolvedSubmitIntent(supabase, replayFingerprint);
          if (replay) {
            return buildReplayResponse(replay);
          }
        }

        if (reservation.intent?.submission_id) {
          const replay = await loadReplayableSubmission(
            supabase,
            reservation.intent.submission_id
          );
          if (replay) {
            return buildReplayResponse(replay);
          }
        }
      }

      const recentReplay = await findRecentMatchingSubmission(supabase, {
        vorname,
        nachname,
        geburtsdatum,
        email,
        answers,
      });
      if (recentReplay) {
        await finalizeSubmitIntent(supabase, replayFingerprint, recentReplay.id);
        return buildReplayResponse(recentReplay);
      }
    }

    const submissionPayload = {
      patient_id: patientId,
      vorname,
      nachname,
      email,
      geburtsdatum,
      patient_anrede: asString(answers["patient_anrede"]),
      versicherter_anrede: asString(answers["vp_anrede"]),
      answers,
      status: "signiert",
    } as const;

    let submissionId: string;

    if (replayFingerprint) {
      const resumable = await findRecentResumableSubmission(supabase, {
        vorname,
        nachname,
        geburtsdatum,
      });

      if (resumable.kind === "replay") {
        await finalizeSubmitIntent(supabase, replayFingerprint, resumable.submission.id);
        return buildReplayResponse(resumable.submission);
      }

      if (resumable.kind === "resume") {
        const { error: resumeError } = await updateSubmissionWithSchemaFallback(
          supabase,
          resumable.submission.id,
          {
            ...submissionPayload,
            fehler_text: null,
            documenso_envelope_id: null,
            documenso_recipient_token: null,
            signed_pdf_path: null,
            signiert_am: null,
            ivoris_synced: false,
            ivoris_doc_synced: false,
            ivoris_sync_error: null,
            ivoris_document_id: null,
            ivoris_sync_retry_count: 0,
            ivoris_doc_retry_count: 0,
            ivoris_sync_next_retry_at: null,
            ivoris_doc_next_retry_at: null,
            ivoris_sync_failed_permanently: false,
            ivoris_doc_failed_permanently: false,
            ivoris_summary_synced: false,
            ivoris_summary_synced_at: null,
            ivoris_summary_hash: null,
          }
        );

        if (resumeError) {
          return NextResponse.json(
            {
              ok: false,
              error: `Resume fehlgeschlagen: ${resumeError.message}`,
            },
            { status: 500 }
          );
        }

        submissionId = resumable.submission.id;
        await finalizeSubmitIntent(supabase, replayFingerprint, submissionId);
      } else {
        const { data: sub, error: insertError } = await insertSubmissionWithSchemaFallback(
          supabase,
          submissionPayload
        );

        if (insertError || !sub) {
          return NextResponse.json(
            {
              ok: false,
              error: `Speichern fehlgeschlagen: ${insertError?.message ?? "unbekannt"}`,
            },
            { status: 500 }
          );
        }

        submissionId = sub.id as string;
        await finalizeSubmitIntent(supabase, replayFingerprint, submissionId);
      }
    } else {
      const { data: sub, error: insertError } = await insertSubmissionWithSchemaFallback(
        supabase,
        submissionPayload
      );

      if (insertError || !sub) {
        return NextResponse.json(
          {
            ok: false,
            error: `Speichern fehlgeschlagen: ${insertError?.message ?? "unbekannt"}`,
          },
          { status: 500 }
        );
      }

      submissionId = sub.id as string;
    }

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
    const resolvedPatientId = await ensureLinkedLocalPatientForSubmission(supabase, {
      submissionId,
      patientId,
      matchedPatientId: abgleich?.patient_id ?? null,
      ivorisId: null,
      vorname,
      nachname,
      geburtsdatum,
      email,
      createdAt: new Date().toISOString(),
      answers,
    });

    // Relevante Stammdaten immer lokal nachziehen, auch wenn der Portal-Account
    // gerade nicht erstellt werden kann. Sonst fehlt der Praxis genau die
    // Übernahme, die sie im Patientenstamm erwartet.
    if (resolvedPatientId) {
      await updatePatientWithSchemaFallback(supabase, resolvedPatientId, {
        portal_zugang: true,
        ...buildSubmissionPatientPatch(answers),
      });
    }

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
      return NextResponse.json({
        ok: true,
        id: submissionId,
        token: signing.token,
        host: documensoHost(),
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
