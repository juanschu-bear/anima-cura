export type ICuraRole = "user" | "assistant";

export interface ICuraMessage {
  id: string;
  role: ICuraRole;
  text: string;
  pending?: boolean;
  error?: boolean;
  guide?: {
    action: "navigate" | "highlight" | "open_chat";
    target: string;
    explanation: string;
  };
}

export interface AppContext {
  currentPage: string;
  locale: "de" | "en";
  theme: "light" | "dark";
  patientCount?: number;
  activeWorkflows?: number;
  openRaten?: number;
  selectedPatient?: { id: string; name: string; behandlung?: string };
}
