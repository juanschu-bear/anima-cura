import { createServerClient } from "@/lib/db/supabase";
import {
  buildSubmissionPatientPatch,
  ensureLinkedLocalPatientForSubmission,
} from "@/lib/services/animasign-local-patient-link";
import { ensurePatientPortalAccount } from "@/lib/services/patient-portal-account";

type SubmissionRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  email: string | null;
  answers: Record<string, unknown> | null;
  patient_id: string | null;
  matched_patient_id: string | null;
  ivoris_patient_id: string | null;
  account_email?: string | null;
};

function extractMissingColumn(message: string | null | undefined): string | null {
  if (!message) return null;
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

async function updatePatientWithSchemaFallback(
  db: ReturnType<typeof createServerClient>,
  patientId: string,
  payload: Record<string, unknown>
) {
  let currentPayload = { ...payload };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await db
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

function parseArgs() {
  const apply = process.argv.includes("--apply");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1];
  const sinceArg = process.argv.find((arg) => arg.startsWith("--since="))?.split("=")[1] ?? null;
  const limit = limitArg ? Number.parseInt(limitArg, 10) : 200;
  return {
    apply,
    since: sinceArg,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 200,
  };
}

async function main() {
  const { apply, since, limit } = parseArgs();
  const db = createServerClient();

  let query = db
    .from("anamnese_submissions")
    .select(
      "id, created_at, vorname, nachname, geburtsdatum, email, answers, patient_id, matched_patient_id, ivoris_patient_id, account_email, status"
    )
    .eq("status", "signiert")
    .or("patient_id.is.null,matched_patient_id.is.null,account_email.is.null,account_email.eq.")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (since) {
    query = query.gte("created_at", since);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Anamnesebogen konnten nicht geladen werden: ${error.message}`);
  }

  const rows = (data ?? []) as SubmissionRow[];
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const answers = row.answers ?? {};

    try {
      if (!apply) {
        results.push({
          submissionId: row.id,
          patientName: [row.vorname, row.nachname].filter(Boolean).join(" "),
          mode: "dry-run",
          needsRepair: !row.patient_id || !row.matched_patient_id,
          currentPatientId: row.patient_id,
          currentMatchedPatientId: row.matched_patient_id,
          currentIvorisPatientId: row.ivoris_patient_id,
          patchKeys: Object.keys(buildSubmissionPatientPatch(answers)),
        });
        continue;
      }

      const linkedPatientId = await ensureLinkedLocalPatientForSubmission(db, {
        submissionId: row.id,
        patientId: row.patient_id,
        matchedPatientId: row.matched_patient_id,
        ivorisId: row.ivoris_patient_id,
        vorname: row.vorname,
        nachname: row.nachname,
        geburtsdatum: row.geburtsdatum,
        email: row.email,
        createdAt: row.created_at,
        answers,
      });

      const patch = {
        portal_zugang: true,
        ...buildSubmissionPatientPatch(answers),
      };

      let patientUpdateError: string | null = null;
      let accountStatus: string | null = null;

      if (apply && linkedPatientId) {
        const { error: updateError } = await updatePatientWithSchemaFallback(
          db,
          linkedPatientId,
          patch
        );

        if (updateError) {
          patientUpdateError = updateError.message;
        } else {
          const account = await ensurePatientPortalAccount({
            vorname: row.vorname,
            nachname: row.nachname,
            patientEmail: row.email,
            patientId: linkedPatientId,
          });
          accountStatus = account.status;

          if (account.status === "created" || account.status === "existing") {
            await db
              .from("anamnese_submissions")
              .update({
                account_email: account.login_email,
                ...(account.status === "created"
                  ? { account_password: account.password }
                  : {}),
              })
              .eq("id", row.id);
          }
        }
      }

      results.push({
        submissionId: row.id,
        patientName: [row.vorname, row.nachname].filter(Boolean).join(" "),
        linkedPatientId,
        mode: "applied",
        patchKeys: Object.keys(patch),
        accountStatus,
        patientUpdateError,
      });
    } catch (entryError) {
      results.push({
        submissionId: row.id,
        patientName: [row.vorname, row.nachname].filter(Boolean).join(" "),
        mode: apply ? "applied" : "dry-run",
        error: entryError instanceof Error ? entryError.message : String(entryError),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: results.every((entry) => !("error" in entry) && !entry.patientUpdateError),
        apply,
        since,
        limit,
        total: rows.length,
        results,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error("[repair-animasign-local-links]", error);
  process.exit(1);
});
