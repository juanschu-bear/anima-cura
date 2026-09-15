export const RECENT_PATIENTS_STORAGE_KEY = "anima-cura:recent-patients:v1";
export const RECENT_PATIENTS_LIMIT = 8;

export type RecentPatient = {
  id: string;
  vorname: string;
  nachname: string;
  geburtsdatum: string | null;
  viewedAt: string;
};

export function parseRecentPatients(raw: string | null): RecentPatient[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is RecentPatient => (
      typeof entry?.id === "string" &&
      typeof entry?.vorname === "string" &&
      typeof entry?.nachname === "string" &&
      (entry?.geburtsdatum === null || typeof entry?.geburtsdatum === "string") &&
      typeof entry?.viewedAt === "string"
    )).slice(0, RECENT_PATIENTS_LIMIT);
  } catch {
    return [];
  }
}

export function addRecentPatient(current: RecentPatient[], patient: RecentPatient): RecentPatient[] {
  return [patient, ...current.filter((entry) => entry.id !== patient.id)]
    .slice(0, RECENT_PATIENTS_LIMIT);
}
