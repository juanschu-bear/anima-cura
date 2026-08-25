import { createServerClient } from "@/lib/db/supabase";

type DbClient = ReturnType<typeof createServerClient>;

export async function syncSignedAnamnesisToPatientDocuments(
  db: DbClient,
  submission: {
    id: string;
    patient_id?: string | null;
    matched_patient_id?: string | null;
    nachname?: string | null;
    vorname?: string | null;
    signiert_am?: string | null;
  },
) {
  void db;
  void submission;
  return { ok: true as const, skipped: true as const, reason: "postbuch_only" };
}
