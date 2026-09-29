import { loadEnvConfig } from "@next/env";
import { execFileSync } from "node:child_process";
import { previewInvitationCampaign, prepareInvitationCampaign, testInvitationCampaign, sendInvitationBatch } from "../src/lib/services/portal-invitation-campaign";

loadEnvConfig(process.cwd());
async function main() {
  if (process.argv[2] !== "--approved-342") throw new Error("Explicit campaign approval flag required");
  // Retrieve only mail transport credentials, in memory; never log secret values.
  for (const [key, id] of [["RESEND_API_KEY", "jnVMFDL8ieAhmbKW"], ["ANIMASIGN_EMAIL_FROM", "AKi14DWwAWfl6vCn"]]) {
    const raw = execFileSync("vercel", ["api", `/v9/projects/prj_eg9lIA7SqjiZOtfhTnEX2SzJHrm7/env/${id}?decrypt=true&teamId=team_gMU3VYaN76PRQIjnmcrenPAQ`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const env = JSON.parse(raw);
    if (env.key !== key || typeof env.value !== "string" || !env.value) throw new Error("Transport credential unavailable");
    process.env[key] = env.value;
  }
  const before = await previewInvitationCampaign();
  if ((!before.prepared && before.eligible !== 342) || (before.prepared && before.total !== 342)) throw new Error("Recipient count differs from approval; stopped");
  const prepared = await prepareInvitationCampaign();
  if (prepared.total !== 342 || prepared.paused || prepared.contentChanged) throw new Error("Campaign does not match approval");
  const tested = await testInvitationCampaign();
  if (!tested.testAccepted) throw new Error("Transport test not accepted; patient dispatch stopped");
  console.log(JSON.stringify({ stage: "test_accepted", total: prepared.total }));
  for (let batch = 0; batch < 115; batch++) {
    const result = await sendInvitationBatch(15);
    console.log(JSON.stringify({ batch: batch + 1, ...result }));
    if (result.dispatchFailed || result.paused || result.contentChanged) throw new Error("Dispatch interrupted; review claims before retry");
    if (!result.pending) {
      if (result.held || result.accepted !== 342) throw new Error("Some recipients require review");
      return;
    }
  }
  throw new Error("Batch limit reached; inspect campaign progress");
}
main().catch(() => { console.error("Approved campaign stopped. Inspect campaign audit; no secrets or recipient data logged."); process.exitCode = 1; });
