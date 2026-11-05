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
