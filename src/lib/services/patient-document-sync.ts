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
  const patientId = submission.matched_patient_id ?? submission.patient_id ?? null;
  if (!patientId) return { ok: false as const, reason: "missing_patient_id" };

  const fileUrl = `/api/anima-sign/submission/${submission.id}/signed-pdf`;
  const fallbackNameBase = [submission.nachname, submission.vorname].filter(Boolean).join(", ").trim();
  const name = fallbackNameBase
    ? `Anamnesebogen ${fallbackNameBase}`
    : "Anamnesebogen";

  const { error } = await db.from("patient_documents").upsert(
    {
      patient_id: patientId,
      name,
      typ: "anamnese",
      file_url: fileUrl,
      hochgeladen_am: submission.signiert_am ?? new Date().toISOString(),
    },
    { onConflict: "patient_id,name,typ" },
  );

  if (error) {
    throw new Error(`patient_documents sync failed: ${error.message}`);
  }

  return { ok: true as const, patientId, fileUrl };
}
