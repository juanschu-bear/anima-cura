import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScribeConsistencyResult } from "@/lib/scribe-consistency";

export type ScribeConfirmationOutcome = "rejected" | "confirmed";

export type ScribeConfirmationIssue = {
  code: string;
  module: string | null;
  group: string | null;
};

export type ScribeConfirmationAttempt = {
  outcome: ScribeConfirmationOutcome;
  template_key: string;
  issues: ScribeConfirmationIssue[];
};

type MonitorClient = Pick<SupabaseClient, "from">;

const cleanPart = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.normalize("NFKC").trim().slice(0, 200)
    : "unbekannt";

/**
 * Privacy boundary for the monitoring table. Only this deliberately small
 * object may cross into persistence; free text, patient ids and names are
 * never copied from the Scribe request.
 */
export function makeScribeConfirmationAttempt(
  raw: unknown,
  outcome: ScribeConfirmationOutcome,
  consistency?: ScribeConsistencyResult,
): ScribeConfirmationAttempt {
  const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const templateKey = `${cleanPart(input.behandlungsart)}|${cleanPart(input.termin_typ)}`;
  const issues = outcome === "rejected"
    ? Array.from(new Map((consistency?.issues ?? []).map((issue) => {
        const item: ScribeConfirmationIssue = {
          code: cleanPart(issue.code),
          module: issue.module ? cleanPart(issue.module) : null,
          group: issue.group ? cleanPart(issue.group) : null,
        };
        return [JSON.stringify(item), item] as const;
      })).values())
    : [];

  return { outcome, template_key: templateKey.slice(0, 401), issues };
}

/** Monitoring is fail-open: a telemetry outage must never block treatment documentation. */
export async function recordScribeConfirmationAttempt(
  db: MonitorClient,
  attempt: ScribeConfirmationAttempt,
): Promise<void> {
  const { error } = await db.from("scribe_confirmation_attempts").insert(attempt);
  if (error) console.error("scribe_confirmation_monitor_write_failed", error.code ?? "unknown");
}

