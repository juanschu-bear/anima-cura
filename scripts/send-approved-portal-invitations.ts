import { loadEnvConfig } from "@next/env";
import { previewInvitationCampaign, prepareInvitationCampaign, testInvitationCampaign, sendInvitationBatch } from "../src/lib/services/portal-invitation-campaign";

loadEnvConfig(process.cwd());
async function main() {
  if (process.argv[2] !== "--approved-342") throw new Error("Explicit campaign approval flag required");
  // Run only where the mail transport is already configured. Production
  // credentials are non-exportable; use the authenticated app UI otherwise.
  if (!process.env.RESEND_API_KEY || !process.env.ANIMASIGN_EMAIL_FROM) throw new Error("Transport credential unavailable");
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
