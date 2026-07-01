import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createServerClient } from "@/lib/db/supabase";
import { syncAnimaSignSubmission } from "@/lib/services/animasign-ivoris-sync";

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

type CreatedSubmission = {
  id: string;
};

const db = (() => {
  loadLocalEnv();
  return createServerClient();
})();

async function createSubmission(input: {
  vorname: string;
  nachname: string;
  email: string;
  geburtsdatum: string;
  ivoris_patient_id?: string | null;
}) {
  const payload = {
    vorname: input.vorname,
    nachname: input.nachname,
    email: input.email,
    geburtsdatum: input.geburtsdatum,
    answers: {
      patient_vorname: input.vorname,
      patient_nachname: input.nachname,
      patient_email: input.email,
      patient_geburtsdatum: input.geburtsdatum,
    },
    status: "signiert",
    is_existing: false,
    ivoris_synced: false,
    ivoris_doc_synced: false,
    ...(input.ivoris_patient_id ? { ivoris_patient_id: input.ivoris_patient_id } : {}),
  };

  const { data, error } = await db
    .from("anamnese_submissions")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Test-Submission konnte nicht erstellt werden: ${error?.message ?? "unbekannt"}`);
  }

  return data as CreatedSubmission;
}

async function deleteSubmissions(ids: string[]) {
  if (!ids.length) return;
  await db.from("anamnese_submissions").delete().in("id", ids);
}

async function fetchSubmission(id: string) {
  const { data, error } = await db
    .from("anamnese_submissions")
    .select("id, ivoris_patient_id, ivoris_synced, ivoris_sync_failed_permanently, ivoris_sync_error")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new Error(`Test-Submission ${id} konnte nicht geladen werden: ${error?.message ?? "unbekannt"}`);
  }

  return data;
}

async function testReusePriorSubmissionId() {
  const stamp = Date.now();
  const vorname = "Codex";
  const nachname = `Reuse${stamp}`;
  const email = `codex.reuse.${stamp}@example.com`;
  const geburtsdatum = "2011-01-01";
  const reusableId = crypto.randomUUID();

  const createdIds: string[] = [];
  try {
    const prior = await createSubmission({
      vorname,
      nachname,
      email,
      geburtsdatum,
      ivoris_patient_id: reusableId,
    });
    createdIds.push(prior.id);

    const current = await createSubmission({
      vorname,
      nachname,
      email,
      geburtsdatum,
    });
    createdIds.push(current.id);

    const result = await syncAnimaSignSubmission(current.id, {
      db,
      stages: ["patient"],
      stageOverrides: {
        patient: {
          attemptNo: 0,
          retryCountOnFailure: 0,
        },
      },
    });

    const saved = await fetchSubmission(current.id);

    assert.equal(result.patient, "skipped");
    assert.equal(saved.ivoris_patient_id, reusableId);
    assert.equal(saved.ivoris_synced, true);

    return {
      name: "reuse prior submission ivoris id",
      ok: true,
      detail: reusableId,
    };
  } finally {
    await deleteSubmissions(createdIds);
  }
}

async function testAmbiguousPriorSubmissionIds() {
  const stamp = Date.now();
  const vorname = "Codex";
  const nachname = `Ambiguous${stamp}`;
  const email = `codex.ambiguous.${stamp}@example.com`;
  const geburtsdatum = "2012-02-02";

  const createdIds: string[] = [];
  try {
    const priorOne = await createSubmission({
      vorname,
      nachname,
      email,
      geburtsdatum,
      ivoris_patient_id: crypto.randomUUID(),
    });
    const priorTwo = await createSubmission({
      vorname,
      nachname,
      email,
      geburtsdatum,
      ivoris_patient_id: crypto.randomUUID(),
    });
    const current = await createSubmission({
      vorname,
      nachname,
      email,
      geburtsdatum,
    });

    createdIds.push(priorOne.id, priorTwo.id, current.id);

    const result = await syncAnimaSignSubmission(current.id, {
      db,
      stages: ["patient"],
      stageOverrides: {
        patient: {
          attemptNo: 0,
          retryCountOnFailure: 0,
        },
      },
    });

    const saved = await fetchSubmission(current.id);

    assert.equal(result.patient, "error");
    assert.equal(saved.ivoris_synced, false);
    assert.equal(saved.ivoris_sync_failed_permanently, true);
    assert.match(saved.ivoris_sync_error ?? "", /MANUAL_REVIEW:/);

    return {
      name: "manual review on ambiguous prior ivoris ids",
      ok: true,
      detail: saved.ivoris_sync_error,
    };
  } finally {
    await deleteSubmissions(createdIds);
  }
}

async function main() {
  const results = [];
  results.push(await testReusePriorSubmissionId());
  results.push(await testAmbiguousPriorSubmissionIds());

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
