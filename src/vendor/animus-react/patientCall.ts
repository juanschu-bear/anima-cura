import type { AnimusPatient, AnimusScene } from "./types";

interface HandlePatientCallArgs {
  scene: AnimusScene | null;
  patient: AnimusPatient;
  showCard: boolean;
  setCard: (patient: AnimusPatient) => void;
  onPatientCall?: (patient: AnimusPatient) => void;
  onPatientFocus?: (patient: AnimusPatient) => void;
  log?: (...parts: unknown[]) => void;
}

export function handlePatientCall(args: HandlePatientCallArgs): boolean {
  const { scene, patient, showCard, setCard, onPatientCall, onPatientFocus, log = console.log } = args;
  const matched = scene?.focusByName(patient.name) ?? false;
  log("onPatientCall", patient.name, "match:", matched ? patient.name : null, patient.id ?? null);
  if (!matched) {
    if (showCard) setCard(patient);
    onPatientFocus?.(patient);
  }
  onPatientCall?.(patient);
  return matched;
}
