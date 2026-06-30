import { createServerClient } from "@/lib/db/supabase";
import {
  runNextPendingAnimaSignStage,
  type NextStageSyncResult,
} from "@/lib/services/animasign-ivoris-sync";

function readPositiveInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function drainStage(
  stage: "patient" | "document",
  limit: number
): Promise<NextStageSyncResult[]> {
  if (limit <= 0) return [];

  const db = createServerClient();
  const results: NextStageSyncResult[] = [];
  const claimedIds = new Set<string>();

  for (let index = 0; index < limit; index += 1) {
    const next = await runNextPendingAnimaSignStage(stage, {
      db,
      excludeSubmissionIds: Array.from(claimedIds),
    });

    results.push(next);

    if (!next.found) {
      break;
    }

    if (next.submissionId) {
      claimedIds.add(next.submissionId);
    }
  }

  return results;
}

async function main() {
  const patientLimit = readPositiveInt("ANIMASIGN_SYNC_WORKER_PATIENT_LIMIT", 3);
  const documentLimit = readPositiveInt("ANIMASIGN_SYNC_WORKER_DOCUMENT_LIMIT", 5);

  console.log(
    `[AnimaSignSyncWorker] start patientLimit=${patientLimit} documentLimit=${documentLimit}`
  );

  const patientRuns = await drainStage("patient", patientLimit);
  const documentRuns = await drainStage("document", documentLimit);

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
  };

  console.log("[AnimaSignSyncWorker] completed", JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[AnimaSignSyncWorker] fatal error:", error);
  process.exitCode = 1;
});
