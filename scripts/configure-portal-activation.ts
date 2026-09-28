/** --check is read-only; --activate adds the prospective workflow, never sends mail. */
import { loadEnvConfig } from "@next/env";
import { createServerClient } from "../src/lib/db/supabase";
import { PORTAL_ACTIVATION_WORKFLOW_ID, loadActivationCohort, portalActivationDefinition, selectActivationRecipients } from "../src/lib/services/portal-activation-workflow";

loadEnvConfig(process.cwd());
async function main() {
  const mode = process.argv[2];
  if (!["--check", "--activate"].includes(mode) || process.argv.length !== 3) throw new Error("Use --check or --activate");
  const db = createServerClient(), now = new Date().toISOString();
  const { data: setting, error } = await db.from("einstellungen").select("value,updated_at").eq("key", "workflows").single();
  if (error || !Array.isArray(setting.value)) throw new Error("Existing workflow list unavailable");
  const schema = await db.from("workflow_runs").select("id,workflow_id,trigger_event,status,started_at,finished_at,result,error").limit(0);
  if (schema.error) throw new Error("Dispatch audit schema unavailable");
  let definition = setting.value.find((item: { id: string }) => item.id === PORTAL_ACTIVATION_WORKFLOW_ID);
  const cohort = await loadActivationCohort(db, now);
  if (mode === "--activate" && !definition) {
    definition = portalActivationDefinition(now);
    const { data: saved, error: saveError } = await db.from("einstellungen")
      .update({ value: [...setting.value, definition], updated_at: now })
      .eq("key", "workflows").eq("updated_at", setting.updated_at).select("key").single();
    if (saveError || !saved) throw new Error("Concurrent workflow edit: configuration unchanged");
  }
  const enabledAfter = definition?.nodes?.find((node: { type: string }) => node.type === "trigger")?.data?.enabledAfter || now;
  console.log(JSON.stringify({ mode, active: definition?.active || false, enabledAfter,
    patientsAudited: cohort.rows.length, submissionsAudited: cohort.submissions.length,
    alreadySignedIn: cohort.rows.filter(row => row.lastSignInAt).length,
    reviewRequired: cohort.rows.filter(row => row.issues.length).length,
    eligibleNewRecipients: selectActivationRecipients(cohort, enabledAfter, now).length,
    emailsSent: 0 }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Activation configuration failed"); process.exitCode = 1; });
