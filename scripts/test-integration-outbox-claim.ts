import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";

async function main() {
  const db = createServerClient();
  const runId = randomUUID();
  const artifactIds = [randomUUID(), randomUUID()];
  const idempotencyKeys = artifactIds.map((id, index) => `selftest:${runId}:${index}:${id}`);

  const { data: inserted, error: insertError } = await db
    .from("integration_outbox_jobs")
    .insert(artifactIds.map((artifactId, index) => ({
      artifact_type: "billing",
      artifact_id: artifactId,
      idempotency_key: idempotencyKeys[index],
      status: "queued",
    })))
    .select("id");

  if (insertError) throw new Error(insertError.message);
  const insertedIds = (inserted ?? []).map((row) => String(row.id));

  try {
    const [first, second] = await Promise.all([
      db.rpc("claim_integration_outbox_job", {
        p_artifact_type: "billing",
        p_worker_id: `selftest-a-${runId}`,
        p_lease_minutes: 1,
      }),
      db.rpc("claim_integration_outbox_job", {
        p_artifact_type: "billing",
        p_worker_id: `selftest-b-${runId}`,
        p_lease_minutes: 1,
      }),
    ]);

    if (first.error) throw new Error(first.error.message);
    if (second.error) throw new Error(second.error.message);
    const firstJob = Array.isArray(first.data) ? first.data[0] : null;
    const secondJob = Array.isArray(second.data) ? second.data[0] : null;
    assert.ok(firstJob, "Worker A muss einen Testjob reservieren");
    assert.ok(secondJob, "Worker B muss einen Testjob reservieren");
    assert.notEqual(firstJob.id, secondJob.id, "Parallele Worker duerfen nie denselben Job reservieren");
    assert.ok(insertedIds.includes(String(firstJob.id)));
    assert.ok(insertedIds.includes(String(secondJob.id)));

    console.log(JSON.stringify({
      ok: true,
      claimedDistinctJobs: 2,
      patientDataTouched: false,
    }));
  } finally {
    const { error: cleanupError } = await db
      .from("integration_outbox_jobs")
      .delete()
      .in("idempotency_key", idempotencyKeys);
    if (cleanupError) throw new Error(`Outbox-Selbsttest Cleanup fehlgeschlagen: ${cleanupError.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
