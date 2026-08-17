import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // optional
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("FEHLT: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listAllUsers() {
  const all = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    all.push(...users);
    if (users.length < 200) break;
    page += 1;
  }
  return all;
}

function getAuthPatientRole(user) {
  const appRole = typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;
  const metaRole = typeof user.user_metadata?.role === "string" ? user.user_metadata.role : null;
  return appRole === "patient" || metaRole === "patient";
}

async function main() {
  const users = await listAllUsers();
  const usersById = new Map(users.map((user) => [user.id, user]));

  const { data: profiles, error: profilesError } = await admin
    .from("user_profiles")
    .select("id, email, display_name, role, patient_id")
    .eq("role", "patient");

  if (profilesError) throw profilesError;

  const summary = {
    scannedProfiles: profiles?.length ?? 0,
    scannedUsers: users.length,
    updatedAuthUsers: 0,
    createdProfiles: 0,
    updatedProfiles: 0,
    missingAuthUsers: 0,
    mismatchedEmails: 0,
  };

  for (const profile of profiles ?? []) {
    const user = usersById.get(profile.id);
    if (!user) {
      summary.missingAuthUsers += 1;
      console.warn(`[FEHLT AUTH] ${profile.display_name || profile.email || profile.id}`);
      continue;
    }

    const nextUserMetadata = {
      ...user.user_metadata,
      role: "patient",
      patient_id: profile.patient_id,
      display_name: profile.display_name || user.user_metadata?.display_name || user.email || "Patient",
      full_name: profile.display_name || user.user_metadata?.full_name || user.email || "Patient",
    };

    const authNeedsUpdate =
      !getAuthPatientRole(user) ||
      user.user_metadata?.patient_id !== profile.patient_id ||
      user.user_metadata?.display_name !== nextUserMetadata.display_name ||
      user.user_metadata?.full_name !== nextUserMetadata.full_name;

    if (authNeedsUpdate) {
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { ...user.app_metadata, role: "patient" },
        user_metadata: nextUserMetadata,
      });
      if (error) throw error;
      summary.updatedAuthUsers += 1;
    }

    if (user.email && profile.email && user.email.toLowerCase() !== profile.email.toLowerCase()) {
      summary.mismatchedEmails += 1;
      console.warn(`[EMAIL ABWEICHUNG] profile=${profile.email} auth=${user.email} user=${user.id}`);
    }
  }

  for (const user of users) {
    if (!getAuthPatientRole(user)) continue;
    const patientId =
      typeof user.user_metadata?.patient_id === "string" && user.user_metadata.patient_id.trim()
        ? user.user_metadata.patient_id.trim()
        : null;

    if (!patientId) continue;

    const existingProfile = (profiles ?? []).find((profile) => profile.id === user.id);
    if (!existingProfile) {
      const { error } = await admin.from("user_profiles").upsert(
        {
          id: user.id,
          email: user.email ?? "",
          display_name:
            (typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name) ||
            (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
            user.email ||
            "Patient",
          role: "patient",
          patient_id: patientId,
        },
        { onConflict: "id" },
      );
      if (error) throw error;
      summary.createdProfiles += 1;
      continue;
    }

    const desiredDisplayName =
      existingProfile.display_name ||
      (typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name) ||
      (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
      user.email ||
      "Patient";

    if (
      existingProfile.patient_id !== patientId ||
      existingProfile.email !== (user.email ?? "") ||
      existingProfile.display_name !== desiredDisplayName
    ) {
      const { error } = await admin.from("user_profiles").upsert(
        {
          id: user.id,
          email: user.email ?? "",
          display_name: desiredDisplayName,
          role: "patient",
          patient_id: patientId,
        },
        { onConflict: "id" },
      );
      if (error) throw error;
      summary.updatedProfiles += 1;
    }
  }

  console.log("\n=== Patient Portal Account Reconcile ===");
  console.table(summary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
