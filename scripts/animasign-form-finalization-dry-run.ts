import { createServerClient } from "@/lib/db/supabase";
import { validateIntakeAnswers } from "@/lib/services/intake-required-fields";
import { isFormSignatureFinalizationEnabled } from "@/lib/services/animasign-form-signature-finalization";

type Submission = {
  id: string;
  created_at: string;
  status: string;
  signed_pdf_path: string | null;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  answers: Record<string, unknown> | null;
};

function normalize(value: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function identityKey(row: Submission) {
  return [normalize(row.vorname), normalize(row.nachname), row.geburtsdatum ?? ""].join("|");
}

function isCompleted(row: Submission) {
  return Boolean(row.signed_pdf_path) &&
    (row.status === "signiert" || row.status === "an_ivoris_uebertragen");
}

function validSignature(value: unknown) {
  return typeof value === "string" &&
    /^data:image\/(?:png|jpe?g);base64,[A-Za-z0-9+/=]+$/i.test(value);
}

async function main() {
  const db = createServerClient();
  const { data, error } = await db
    .from("anamnese_submissions")
    .select("id,created_at,status,signed_pdf_path,vorname,nachname,geburtsdatum,answers")
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Submission[];
  const latestSuccessfulAt = new Map<string, number>();
  for (const row of rows) {
    if (!isCompleted(row)) continue;
    const timestamp = Date.parse(row.created_at);
    const key = identityKey(row);
    if (key === "||" || !Number.isFinite(timestamp)) continue;
    latestSuccessfulAt.set(key, Math.max(latestSuccessfulAt.get(key) ?? 0, timestamp));
  }

  const unresolved = rows.filter(
    (row) =>
      ["offen", "signatur_ausstehend", "fehler"].includes(row.status) &&
      !row.signed_pdf_path,
  );
  const actionable = unresolved.filter((row) => {
    const successAt = latestSuccessfulAt.get(identityKey(row));
    return !successAt || successAt <= Date.parse(row.created_at);
  });

  const byStatus = Object.fromEntries(
    ["offen", "signatur_ausstehend", "fehler"].map((status) => [
      status,
      actionable.filter((row) => row.status === status).length,
    ]),
  );
  const readiness = {
    withStoredSignature: 0,
    withLocationAndDate: 0,
    completeRequiredFields: 0,
    technicallyFinalizable: 0,
  };

  for (const row of actionable) {
    const answers = row.answers ?? {};
    const hasSignature = validSignature(answers.unterschrift_versicherter);
    const hasLocationAndDate =
      typeof answers.abschluss_ort === "string" && answers.abschluss_ort.trim() !== "" &&
      typeof answers.abschluss_datum === "string" && /^\d{4}-\d{2}-\d{2}$/.test(answers.abschluss_datum);
    const complete = validateIntakeAnswers(answers).length === 0;
    if (hasSignature) readiness.withStoredSignature += 1;
    if (hasLocationAndDate) readiness.withLocationAndDate += 1;
    if (complete) readiness.completeRequiredFields += 1;
    // Historical submissions are finalized from the facts that were valid at
    // their submission time. Newer required fields must not retroactively
    // disqualify an otherwise complete stored signature, place and date.
    if (hasSignature && hasLocationAndDate) readiness.technicallyFinalizable += 1;
  }

  const configuration = {
    pdfServiceConfigured: Boolean(process.env.ANIMASIGN_PDF_URL && process.env.ANIMASIGN_PDF_KEY),
    practiceCertificateConfigured: Boolean(
      process.env.PDF_SIGNING_CERT && process.env.PDF_SIGNING_PASSPHRASE,
    ),
    featureEnabled: isFormSignatureFinalizationEnabled(),
  };

  console.log("# AnimaSign Formularabschluss - Dry-Run");
  console.log("");
  console.log("Es wurden keine Daten, PDFs, Statuswerte, Envelopes oder E-Mails verändert.");
  console.log("");
  console.log("| Kennzahl | Anzahl |");
  console.log("|---|---:|");
  console.log(`| Offene Datensätze vor Ausschluss später erfolgreicher Einreichungen | ${unresolved.length} |`);
  console.log(`| Davon historisch durch spätere erfolgreiche Einreichung erledigt | ${unresolved.length - actionable.length} |`);
  console.log(`| Technische Finalisierungsaufträge | ${actionable.length} |`);
  console.log(`| Status offen | ${byStatus.offen} |`);
  console.log(`| Status signatur_ausstehend | ${byStatus.signatur_ausstehend} |`);
  console.log(`| Status fehler | ${byStatus.fehler} |`);
  console.log(`| Mit gespeicherter Formular-Unterschrift | ${readiness.withStoredSignature} |`);
  console.log(`| Mit Ort und Datum | ${readiness.withLocationAndDate} |`);
  console.log(`| Pflichtfelder nach heutiger Prüfung vollständig | ${readiness.completeRequiredFields} |`);
  console.log(`| Nach heutigem Datenstand technisch finalisierbar | ${readiness.technicallyFinalizable} |`);
  console.log("");
  console.log("| Konfiguration | Bereit |");
  console.log("|---|---|");
  console.log(`| PDF-Dienst | ${configuration.pdfServiceConfigured ? "ja" : "nein"} |`);
  console.log(`| Praxiszertifikat | ${configuration.practiceCertificateConfigured ? "ja" : "nein"} |`);
  console.log(`| Neuer Ablauf aktiviert | ${configuration.featureEnabled ? "ja" : "nein"} |`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

