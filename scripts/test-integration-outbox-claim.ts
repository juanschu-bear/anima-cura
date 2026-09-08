import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";

async function main() {
  const db = createServerClient();
  const runId = randomUUID();
  const artifactIds = [randomUUID(), randomUUID(), randomUUID()];
  const idempotencyKeys = artifactIds.map((id, index) => `selftest:${runId}:${index}:${id}`);

  const { data: inserted, error: insertError } = await db
    .from("integration_outbox_jobs")
    .insert(artifactIds.map((artifactId, index) => ({
      artifact_type: "billing",
      artifact_id: artifactId,
      idempotency_key: idempotencyKeys[index],
      status: "queued",
      ...(index === 2 ? { status: "retry_wait", next_attempt_at: "2999-01-01T00:00:00.000Z" } : {}),
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

    const specificArtifactId = artifactIds[2];
    const [specificA, specificB] = await Promise.all([
      db.rpc("claim_integration_outbox_job_for_artifact", {
        p_artifact_type: "billing",
        p_artifact_id: specificArtifactId,
        p_worker_id: `specific-a-${runId}`,
        p_lease_minutes: 1,
        p_force: true,
      }),
      db.rpc("claim_integration_outbox_job_for_artifact", {
        p_artifact_type: "billing",
        p_artifact_id: specificArtifactId,
        p_worker_id: `specific-b-${runId}`,
        p_lease_minutes: 1,
        p_force: true,
      }),
    ]);
    if (specificA.error) throw new Error(specificA.error.message);
    if (specificB.error) throw new Error(specificB.error.message);
    const specificClaims = [specificA.data, specificB.data]
      .filter((rows) => Array.isArray(rows) && rows.length > 0);
    assert.equal(specificClaims.length, 1, "Nur ein direkter Prozess darf dasselbe Artefakt reservieren");

    console.log(JSON.stringify({
      ok: true,
      claimedDistinctJobs: 2,
      sameArtifactClaimedOnce: true,
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
