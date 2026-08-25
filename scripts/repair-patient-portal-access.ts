import { createAdminClient } from "@/lib/db/supabase";
import { repairPatientPortalAccess } from "@/lib/services/patient-portal-access";

async function main() {
  const admin = createAdminClient();
  const repaired: Array<{ email: string; patientId: string; status: string; reason?: string }> = [];
  const unresolved: Array<{ email: string; reason: string }> = [];

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  for (const user of data.users) {
    const role =
      (typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null) ??
      (typeof user.user_metadata?.role === "string" ? user.user_metadata.role : null);
    if (role !== "patient") continue;

    const profile = await admin
      .from("user_profiles")
      .select("patient_id, role")
      .eq("id", user.id)
      .maybeSingle();

    const metadataPatientId =
      typeof user.user_metadata?.patient_id === "string" && user.user_metadata.patient_id.trim()
        ? user.user_metadata.patient_id.trim()
        : null;
    const profilePatientId =
      typeof profile.data?.patient_id === "string" && profile.data.patient_id.trim()
        ? profile.data.patient_id.trim()
        : null;

    if (metadataPatientId && profilePatientId && profile.data?.role === "patient") continue;

    const result = await repairPatientPortalAccess(user);
    if (result.status === "repaired" || result.status === "already_ok") {
      repaired.push({
        email: user.email ?? user.id,
        patientId: result.patientId,
        status: result.status,
        reason: "reason" in result ? result.reason : undefined,
      });
    } else {
      unresolved.push({
        email: user.email ?? user.id,
        reason: result.reason,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: unresolved.length === 0,
        repairedCount: repaired.length,
        unresolvedCount: unresolved.length,
        repaired,
        unresolved,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
