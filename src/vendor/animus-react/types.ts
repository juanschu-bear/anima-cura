import type { CSSProperties } from "react";

export type Gender = "w" | "m" | "d";

/** A patient node in the HUD. `name` is matched on first-name for voice calls. */
export interface AnimusPatient {
  /** Real record id, set by the host so focus and save can map back to the source. */
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

/** One billing line in a draft, mirrors the cockpit position rows. */
export interface DokuPosition {
  code: string;
  text: string;
  anzahl?: number;
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
  bestaetigen: boolean;
}

/** Agent announces a dictation has started (the panel can show a building state). */
export interface DokuStartMessage {
  type: "doku_start";
  behandlungsart: string;
  termin_typ: string;
  name: string;
}

/** Agent hands over the finished draft for the doctor to confirm. */
export interface DokuOpenMessage {
  type: "doku_open";
  patient: string;
  entwurf: DokuEntwurf;
}

/** Every message ANIMUS may publish on the "animus" data topic. */
export type AnimusMessage = PatientCallMessage | DokuStartMessage | DokuOpenMessage;

export interface AnimusSceneCallbacks {
  onHover?: (patient: AnimusPatient | null, x: number, y: number) => void;
  onFocus?: (patient: AnimusPatient) => void;
  onUnfocus?: () => void;
}

/** Framework-agnostic handle returned by createAnimusScene. */
export interface AnimusScene {
  /** 0..1 voice level; drives the reactive core. */
  setLevel: (level: number) => void;
  /** Focus the node whose first name matches; returns false if none found. */
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
  greeting?: string;
  /** Connect to the agent automatically on mount. Default false. */
  autoConnect?: boolean;
  /** Called in addition to the built-in zoom when the agent calls a patient. */
  onPatientCall?: (patient: AnimusPatient) => void;
  /** Called when a node gains focus, on voice call and on click alike. Lets the
   *  host render its own card. */
  onPatientFocus?: (patient: AnimusPatient) => void;
  /** Render the built-in patient card. Default true. Set false when the host
   *  draws its own card from onPatientFocus. */
  showCard?: boolean;
  /** Called when the agent starts a dictation (vorlage loaded). */
  onDokuStart?: (info: { behandlungsart: string; termin_typ: string; name: string }) => void;
  /** Called when the agent hands over a finished draft. */
  onDokuOpen?: (entwurf: DokuEntwurf, patient: string) => void;
  /** Doctor confirms the draft in the panel. The host writes it through its
   *  authenticated AnimaScribe session (POST /api/doku/eintrag). */
  onDokuConfirm?: (entwurf: DokuEntwurf) => void | Promise<void>;
  className?: string;
  style?: CSSProperties;
}
