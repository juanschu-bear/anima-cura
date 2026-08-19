import { createServerClient } from "@/lib/db/supabase";
import {
  runNextPendingAnimaSignStage,
  type NextStageSyncResult,
} from "@/lib/services/animasign-ivoris-sync";
import { retryPendingScribeIvorisPushes } from "@/lib/services/scribe-ivoris-retry";

type SyncStage = "patient" | "document";
type WorkerFatal = {
  stage: SyncStage;
  message: string;
};

function readPositiveInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`Pflicht-Umgebungsvariable fehlt: ${name}`);
  }
}

function validateWorkerEnv(options: { patientLimit: number; documentLimit: number }) {
  [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "IVORIS_APP",
    "IVORIS_APP_VERSION",
    "IVORIS_API_KEY",
    "IVORIS_LINKNAME",
  ].forEach(requireEnv);

  if (options.documentLimit > 0) {
    requireEnv("IVORIS_PROFILE_ID");
  }
}

async function createWorkerAlert(stage: SyncStage, message: string) {
  const db = createServerClient();
  const { error } = await db.from("alerts").insert({
    typ: "system",
    titel: `AnimaSign Sync Worker Fehler (${stage})`,
    beschreibung:
      `Der AnimaSign Sync Worker hat einen Infrastruktur- oder Laufzeitfehler erkannt.\n\n` +
      `Stage: ${stage}\n` +
      `Fehler: ${message}\n\n` +
      `Der Worker hat den Fehler intern protokolliert und den Restlauf kontrolliert beendet.`,
    schweregrad: "kritisch",
    empfaenger: "alle",
    aktion_url: "/anima-sign",
  });

  if (error) {
    console.error("[AnimaSignSyncWorker] alert insert failed:", error.message);
  }
}

async function drainStage(
  stage: SyncStage,
  limit: number,
  db = createServerClient()
): Promise<{ results: NextStageSyncResult[]; fatal?: WorkerFatal }> {
  if (limit <= 0) return { results: [] };

  const results: NextStageSyncResult[] = [];
  const claimedIds = new Set<string>();

  for (let index = 0; index < limit; index += 1) {
    let next: NextStageSyncResult;

    try {
      next = await runNextPendingAnimaSignStage(stage, {
        db,
        excludeSubmissionIds: Array.from(claimedIds),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[AnimaSignSyncWorker] fatal stage=${stage}:`, error);
      return {
        results,
        fatal: {
          stage,
          message,
        },
      };
    }

    results.push(next);

    if (!next.found) {
      break;
    }

    if (next.submissionId) {
      claimedIds.add(next.submissionId);
    }
  }

  return { results };
}

async function main() {
  const patientLimit = readPositiveInt("ANIMASIGN_SYNC_WORKER_PATIENT_LIMIT", 3);
  const documentLimit = readPositiveInt("ANIMASIGN_SYNC_WORKER_DOCUMENT_LIMIT", 5);
  const scribeRetryLimit = readPositiveInt("SCRIBE_IVORIS_RETRY_LIMIT", 20);
  validateWorkerEnv({ patientLimit, documentLimit });
  const db = createServerClient();

  console.log(
    `[AnimaSignSyncWorker] start patientLimit=${patientLimit} documentLimit=${documentLimit} scribeRetryLimit=${scribeRetryLimit}`
  );

  const scribeRetry = await retryPendingScribeIvorisPushes({
    db,
    limit: scribeRetryLimit,
  });
  console.log("[AnimaSignSyncWorker] scribe retry", JSON.stringify(scribeRetry, null, 2));

  const patientDrain = await drainStage("patient", patientLimit, db);
  const documentDrain = await drainStage("document", documentLimit, db);
  const fatals = [patientDrain.fatal, documentDrain.fatal].filter(
    (entry): entry is WorkerFatal => Boolean(entry)
  );
  const patientRuns = patientDrain.results;
  const documentRuns = documentDrain.results;

  const summary = {
    patient: {
      attempted: patientRuns.filter((entry) => entry.found).length,
      success: patientRuns.filter((entry) => entry.result?.patient === "success").length,
      skipped: patientRuns.filter((entry) => entry.result?.patient === "skipped").length,
      errors: patientRuns.filter((entry) => entry.result?.patient === "error").length,
    },
    document: {
      attempted: documentRuns.filter((entry) => entry.found).length,
      success: documentRuns.filter((entry) => entry.result?.document === "success").length,
      skipped: documentRuns.filter((entry) => entry.result?.document === "skipped").length,
      errors: documentRuns.filter((entry) => entry.result?.document === "error").length,
    },
    scribe: {
      processed: scribeRetry.processed,
      recovered: scribeRetry.recovered,
      failed: scribeRetry.failed,
    },
    fatalStages: fatals,
  };

  console.log("[AnimaSignSyncWorker] completed", JSON.stringify(summary, null, 2));

  for (const fatal of fatals) {
    await createWorkerAlert(fatal.stage, fatal.message);
  }

  if (fatals.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[AnimaSignSyncWorker] fatal error:", error);
  process.exitCode = 1;
});
