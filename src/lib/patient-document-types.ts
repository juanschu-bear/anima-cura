export type PatientDocumentTypeOption = {
  value: string;
  label: string;
  storageType: string;
  icon: string;
};

const TYPE_PREFIX = "[[typ:";

export const patientDocumentTypeOptions: PatientDocumentTypeOption[] = [
  { value: "anfangsdiagnostik", label: "Anfangsdiagnostik", storageType: "sonstiges", icon: "🦷" },
  { value: "diagnose", label: "Diagnose", storageType: "sonstiges", icon: "🩺" },
  { value: "behandlungsplan", label: "Behandlungsplan", storageType: "kostenplan", icon: "🗂️" },
  { value: "erste_rechnung", label: "Erste Rechnung", storageType: "ratenzahlung", icon: "💶" },
  { value: "kostenplan", label: "Heil- und Kostenplan", storageType: "kostenplan", icon: "📋" },
  { value: "vertrag", label: "Behandlungsvertrag", storageType: "vertrag", icon: "📝" },
  { value: "ratenzahlung", label: "Ratenzahlungsvereinbarung", storageType: "ratenzahlung", icon: "🧾" },
  { value: "datenschutz", label: "Datenschutzerklärung", storageType: "datenschutz", icon: "🔒" },
  { value: "sonstiges", label: "Sonstiges", storageType: "sonstiges", icon: "📄" },
];

const patientDocumentTypeMap = new Map(
  patientDocumentTypeOptions.map((option) => [option.value, option]),
);

export function getPatientDocumentTypeOption(value: string | null | undefined) {
  return patientDocumentTypeMap.get(value || "") || patientDocumentTypeMap.get("sonstiges")!;
}

export function encodePatientDocumentName(name: string, selectedType: string) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const option = getPatientDocumentTypeOption(selectedType);
  if (option.value === option.storageType) return trimmed;
  if (trimmed.startsWith(TYPE_PREFIX)) return trimmed;
  return `${TYPE_PREFIX}${option.value}]] ${trimmed}`;
}

export function decodePatientDocumentRecord(input: {
  name: string;
  typ: string;
  file_url?: string | null;
  hochgeladen_am?: string | null;
  id?: string;
}) {
  const match = input.name.match(/^\[\[typ:([a-z_]+)\]\]\s*/i);
  const rawType = match?.[1] || input.typ || "sonstiges";
  const option = getPatientDocumentTypeOption(rawType);
  const cleanName = match ? input.name.replace(match[0], "").trim() : input.name;

  return {
    ...input,
    name: cleanName,
    typ: option.value,
    anzeige_typ: option.label,
    icon: option.icon,
  };
}
