import { createServerClient } from "@/lib/db/supabase";
import { retryPendingAnimaSignSyncs } from "@/lib/services/animasign-ivoris-sync";

type DbClient = ReturnType<typeof createServerClient>;

const SETTINGS_KEY = "animasign_supervisor_state";
const ALERT_ACTION_URL = "/anima-sign";

type SubmissionMonitorRow = {
  id: string;
  created_at: string;
  status: string | null;
  ivoris_synced: boolean | null;
  ivoris_doc_synced: boolean | null;
  ivoris_sync_error: string | null;
  ivoris_sync_next_retry_at: string | null;
  ivoris_doc_next_retry_at: string | null;
  ivoris_sync_failed_permanently: boolean | null;
  ivoris_doc_failed_permanently: boolean | null;
};

type SyncLogMonitorRow = {
  submission_id: string;
  stage: string;
  status: string;
  created_at: string;
  error_text: string | null;
};

type SupervisorMetrics = {
  patientPending: number;
  documentPending: number;
  retryDuePatient: number;
  retryDueDocument: number;
  permanentFailures: number;
  latestErrorGroups: Array<{ error: string; count: number }>;
};

type SupervisorState = {
  version: number;
  status: "healthy" | "degraded";
  signature: string;
  summary: SupervisorMetrics;
  autoHeal: {
    attemptedAt: string | null;
    processed: number;
    patientSuccess: number;
    documentSuccess: number;
    failures: number;
    skippedReason?: string | null;
  } | null;
  lastAlertAt: string | null;
  updated_at: string;
};

function normalizeState(value: unknown): SupervisorState | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.signature !== "string") return null;
  if (entry.status !== "healthy" && entry.status !== "degraded") return null;
  if (typeof entry.updated_at !== "string") return null;
  return entry as unknown as SupervisorState;
}

function isRetryDue(value: string | null | undefined) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

function buildSignature(metrics: SupervisorMetrics) {
  const firstErrors = metrics.latestErrorGroups
    .slice(0, 3)
    .map((entry) => `${entry.count}:${entry.error}`)
    .join("|");

  return [
    `pp:${metrics.patientPending}`,
    `dp:${metrics.documentPending}`,
    `rp:${metrics.retryDuePatient}`,
    `rd:${metrics.retryDueDocument}`,
    `pf:${metrics.permanentFailures}`,
    `e:${firstErrors}`,
  ].join(";");
}

function hasWorkerEnv() {
  return [
    "IVORIS_APP",
    "IVORIS_APP_VERSION",
    "IVORIS_API_KEY",
    "IVORIS_LINKNAME",
  ].every((key) => Boolean(process.env[key]?.trim()));
}

function shouldEscalate(previous: SupervisorState | null, next: SupervisorMetrics) {
  if (!previous) return true;
  if (previous.status !== "degraded") return true;

  const prev = previous.summary;
  const previousTopError = prev.latestErrorGroups[0]?.error ?? null;
  const nextTopError = next.latestErrorGroups[0]?.error ?? null;

  return (
    next.patientPending > prev.patientPending ||
    next.documentPending > prev.documentPending ||
    next.retryDuePatient > prev.retryDuePatient ||
    next.retryDueDocument > prev.retryDueDocument ||
    next.permanentFailures > prev.permanentFailures ||
    (nextTopError !== null && nextTopError !== previousTopError)
  );
}

async function loadMetrics(db: DbClient): Promise<SupervisorMetrics> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [submissionsRes, logsRes] = await Promise.all([
    db
      .from("anamnese_submissions")
      .select(
        "id, created_at, status, ivoris_synced, ivoris_doc_synced, ivoris_sync_error, ivoris_sync_next_retry_at, ivoris_doc_next_retry_at, ivoris_sync_failed_permanently, ivoris_doc_failed_permanently"
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000),
    db
      .from("animasign_sync_log")
      .select("submission_id, stage, status, created_at, error_text")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  if (submissionsRes.error) throw new Error(submissionsRes.error.message);
  if (logsRes.error) throw new Error(logsRes.error.message);

  const submissions = (submissionsRes.data ?? []) as SubmissionMonitorRow[];
  const logs = (logsRes.data ?? []) as SyncLogMonitorRow[];

  const latestByStage = new Map<string, SyncLogMonitorRow>();
  for (const log of logs) {
    const key = `${log.submission_id}:${log.stage}`;
    if (!latestByStage.has(key)) {
      latestByStage.set(key, log);
    }
  }

  const latestErrorCounts = new Map<string, number>();
  for (const log of Array.from(latestByStage.values())) {
    if (log.status !== "error") continue;
    const key = (log.error_text ?? "Unbekannter Fehler").slice(0, 180);
    latestErrorCounts.set(key, (latestErrorCounts.get(key) ?? 0) + 1);
  }

  return {
    patientPending: submissions.filter((row) => row.ivoris_synced !== true).length,
    documentPending: submissions.filter(
      (row) => row.status === "signiert" && row.ivoris_doc_synced !== true
    ).length,
    retryDuePatient: submissions.filter(
      (row) => row.ivoris_synced !== true && isRetryDue(row.ivoris_sync_next_retry_at)
    ).length,
    retryDueDocument: submissions.filter(
      (row) =>
        row.status === "signiert" &&
        row.ivoris_doc_synced !== true &&
        isRetryDue(row.ivoris_doc_next_retry_at)
    ).length,
    permanentFailures: submissions.filter(
      (row) =>
        row.ivoris_sync_failed_permanently === true ||
        row.ivoris_doc_failed_permanently === true
    ).length,
    latestErrorGroups: Array.from(latestErrorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8),
  };
}

async function readPreviousState(db: DbClient) {
  const { data, error } = await db
    .from("einstellungen")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return normalizeState(data?.value);
}

async function writeState(db: DbClient, state: SupervisorState) {
  const { error } = await db.from("einstellungen").upsert(
    {
      key: SETTINGS_KEY,
      value: state,
      updated_at: state.updated_at,
    },
    { onConflict: "key" }
  );

  if (error) throw new Error(error.message);
}

async function createAlert(db: DbClient, metrics: SupervisorMetrics) {
  const topError = metrics.latestErrorGroups[0];
  const lines = [
    "Der AnimaSign-Supervisor hat nach automatischer Nachsteuerung weiterhin offenen IVORIS-Reststau erkannt.",
    "",
    `Offene Patientensyncs: ${metrics.patientPending}`,
    `Offene Dokumentsyncs: ${metrics.documentPending}`,
    `Sofort retry-faehig (Patient): ${metrics.retryDuePatient}`,
    `Sofort retry-faehig (Dokument): ${metrics.retryDueDocument}`,
    `Dauerhaft angehalten: ${metrics.permanentFailures}`,
    topError ? `Haeufigster letzter Fehler: ${topError.error} (${topError.count}x)` : null,
  ].filter(Boolean);

  const { error } = await db.from("alerts").insert({
    typ: "system",
    titel: "AnimaSign Supervisor: Reststau nach Auto-Heilung",
    beschreibung: lines.join("\n"),
    schweregrad: metrics.permanentFailures > 0 ? "kritisch" : "warnung",
    empfaenger: "alle",
    aktion_url: ALERT_ACTION_URL,
  });

  if (error) throw new Error(error.message);
}

async function main() {
  const db = createServerClient();
  const checkedAt = new Date().toISOString();
  const before = await loadMetrics(db);

  let autoHeal = null as SupervisorState["autoHeal"];

  if ((before.retryDuePatient > 0 || before.retryDueDocument > 0) && hasWorkerEnv()) {
    const result = await retryPendingAnimaSignSyncs({
      db,
      limit: Math.min(150, before.retryDuePatient + before.retryDueDocument + 10),
    });

    autoHeal = {
      attemptedAt: checkedAt,
      processed: result.processed,
      patientSuccess: result.patientSuccess,
      documentSuccess: result.documentSuccess,
      failures: result.failures,
      skippedReason: null,
    };
  } else if (before.retryDuePatient > 0 || before.retryDueDocument > 0) {
    autoHeal = {
      attemptedAt: checkedAt,
      processed: 0,
      patientSuccess: 0,
      documentSuccess: 0,
      failures: 0,
      skippedReason:
        "Auto-Heal uebersprungen, weil die IVORIS-Worker-Secrets in dieser Laufumgebung nicht vollstaendig vorhanden sind.",
    };
  }

  const after = await loadMetrics(db);
  const degraded =
    after.patientPending > 0 ||
    after.documentPending > 0 ||
    after.permanentFailures > 0;

  const previous = await readPreviousState(db);
  const signature = buildSignature(after);
  const nextState: SupervisorState = {
    version: 1,
    status: degraded ? "degraded" : "healthy",
    signature,
    summary: after,
    autoHeal,
    lastAlertAt:
      previous?.lastAlertAt && previous.signature === signature ? previous.lastAlertAt : null,
    updated_at: new Date().toISOString(),
  };

  const shouldAlert = degraded && shouldEscalate(previous, after);

  if (shouldAlert) {
    await createAlert(db, after);
    nextState.lastAlertAt = new Date().toISOString();
  }

  await writeState(db, nextState);

  console.log(
    JSON.stringify(
      {
        ok: true,
        checkedAt,
        before,
        after,
        autoHeal,
        alertCreated: shouldAlert,
        signature,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[AnimaSignSupervisor]", error);
  process.exit(1);
});
