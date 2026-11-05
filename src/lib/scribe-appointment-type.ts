export type ScribeAppointmentTypeLabel = {
  termin_typ: string;
  name: string;
  struktur?: {
    praxis_muster?: string;
  } | null;
};

export function scribeAppointmentTypeDisplayName(
  appointmentType: ScribeAppointmentTypeLabel,
): string {
  return appointmentType.name;
}

export function normalizeScribeAppointmentTypeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name.length > 0 && name.length <= 120 ? name : null;
}
