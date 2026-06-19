import type { CSSProperties } from "react";
import type { WakeWordState } from "./wakeWord";

export type Gender = "w" | "m" | "d";

/** A patient node in the HUD. `name` is matched fuzzily for voice calls. */
export interface AnimusPatient {
  id?: string;
  name: string;
  gender: Gender;
  age?: number;
  treatment?: string;
  phase?: string;
  next?: string;
  /** 0..100, drives the card progress bar. */
  progress?: number;
}

/** Payload the agent publishes on the LiveKit data topic "animus". */
export interface PatientCallMessage {
  type: "patient_call";
  patient: AnimusPatient;
}

export interface PatientUnfocusMessage {
  type: "patient_unfocus";
}

/** One billing line in a draft, mirrors the cockpit position rows. */
export interface DokuPosition {
  code: string;
  text: string;
  anzahl?: number;
}

export interface DokuOption {
  text: string;
  on: boolean;
}

export interface DokuGruppe {
  gid: string;
  label: string;
  req?: boolean;
  type?: "single" | "multi";
  opts: DokuOption[];
}

export interface DokuStartInfo {
  behandlungsart: string;
  termin_typ: string;
  name: string;
  modus?: "dictation" | "chooser";
  behandlungsarten?: string[];
  termin_optionen?: string[];
  hint?: string;
}

/** The assembled draft the agent hands to the HUD (mirror of the cockpit entry). */
export interface DokuEntwurf {
  patient_id: string;
  vorlage_id?: string | null;
  behandlungsart?: string | null;
  termin_typ?: string | null;
  text: string;
  zaehne: string[];
  variablen: Record<string, unknown>;
  auswahl: Record<string, Record<string, number[]>>;
  positionen: DokuPosition[];
  gruppen?: DokuGruppe[];
  bestaetigen: boolean;
}

/** Agent announces a dictation has started (the panel can show a building state). */
export interface DokuStartMessage {
  type: "doku_start";
  behandlungsart: string;
  termin_typ: string;
  name: string;
  modus?: "dictation" | "chooser";
  behandlungsarten?: string[];
  termin_optionen?: string[];
  hint?: string;
}

/** Agent hands over the finished draft for the doctor to confirm. */
export interface DokuOpenMessage {
  type: "doku_open";
  patient: string;
  entwurf: DokuEntwurf;
}

export interface DokuUpdateMessage {
  type: "doku_update";
  patient: string;
  entwurf: DokuEntwurf;
  frage?: string;
}

export interface AnimusLearningFact {
  key: string;
  text: string;
  category: string;
  count: number;
  last_seen: string;
}

export interface AnimusDiaryEntry {
  created_at?: string;
  reason: string;
  patient_name: string;
  title: string;
  preview: string;
  learning_notes: string[];
}

export interface AnimusMemorySnapshot {
  type: "memory_snapshot";
  working_memory: Record<string, unknown>;
  facts: AnimusLearningFact[];
  diary_entries: AnimusDiaryEntry[];
}

/** Every message ANIMUS may publish on the "animus" data topic. */
export type AnimusMessage = PatientCallMessage | PatientUnfocusMessage | DokuStartMessage | DokuUpdateMessage | DokuOpenMessage | AnimusMemorySnapshot;

export interface AnimusSceneCallbacks {
  onHover?: (patient: AnimusPatient | null, x: number, y: number) => void;
  onFocus?: (patient: AnimusPatient) => void;
  onUnfocus?: () => void;
}

export interface AnimusHandle {
  unfocus: () => void;
  focusByName: (name: string) => boolean;
}

/** Framework-agnostic handle returned by createAnimusScene. */
export interface AnimusScene {
  /** 0..1 voice level; drives the reactive core. */
  setLevel: (level: number) => void;
  /** Focus the best-matching node for a spoken name; returns false if none found. */
  focusByName: (name: string) => boolean;
  unfocus: () => void;
  resize: (width: number, height: number) => void;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

export interface AnimusHudProps {
  /** Token server URL, e.g. "http://localhost:8080" (GET /token is appended). */
  tokenEndpoint: string;
  room?: string;
  identity?: string;
  /** Patient nodes. Falls back to a built-in demo set when omitted. */
  patients?: AnimusPatient[];
  /** Greeting lead, the part before the highlighted name. */
  greetingLead?: string;
  /** Name shown in the greeting highlight. */
  userName?: string;
  /** Simple standalone greeting for the minimal HUD variant. */
  greeting?: string;
  /** Connect to the agent automatically on mount. Default false. */
  autoConnect?: boolean;
  /** Arm browser-side wake word recognition while disconnected. */
  wakeWord?: boolean;
  /** Accepted phrases for the wake word, e.g. ["hey animus"]. */
  wakeWordPhrases?: string[];
  /** Called in addition to the built-in zoom when the agent calls a patient. */
  onPatientCall?: (patient: AnimusPatient) => void;
  onPatientFocus?: (patient: AnimusPatient) => void;
  onPatientUnfocus?: () => void;
  showCard?: boolean;
  /** Called when the agent starts a dictation (vorlage loaded). */
  onDokuStart?: (info: DokuStartInfo) => void;
  /** Called while the draft is still being assembled. */
  onDokuUpdate?: (entwurf: DokuEntwurf, patient: string, frage?: string) => void;
  /** Called when the agent hands over a finished draft. */
  onDokuOpen?: (entwurf: DokuEntwurf, patient: string) => void;
  /** Doctor confirms the draft in the panel. The host writes it through its
   *  authenticated AnimaScribe session (POST /api/doku/eintrag). */
  onDokuConfirm?: (entwurf: DokuEntwurf) => void | Promise<void>;
  className?: string;
  style?: CSSProperties;
}

export type { WakeWordState };
