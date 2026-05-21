"use client";

import { create } from "zustand";
import type { ICuraMessage } from "./types";

interface ICuraState {
  open: boolean;
  minimized: boolean;
  messages: ICuraMessage[];
  sending: boolean;
  speakEnabled: boolean;
  highlightSelector: string | null;
  highlightExplanation: string | null;

  setOpen: (v: boolean) => void;
  toggleOpen: () => void;
  setMinimized: (v: boolean) => void;
  setMessages: (m: ICuraMessage[] | ((prev: ICuraMessage[]) => ICuraMessage[])) => void;
  setSending: (v: boolean) => void;
  toggleSpeak: () => void;

  highlight: (selector: string, explanation: string, ms?: number) => void;
  clearHighlight: () => void;
}

export const useICura = create<ICuraState>((set, get) => ({
  open: false,
  minimized: false,
  messages: [],
  sending: false,
  speakEnabled: false,
  highlightSelector: null,
  highlightExplanation: null,

  setOpen: (v) => set({ open: v, minimized: false }),
  toggleOpen: () => set((s) => ({ open: !s.open, minimized: false })),
  setMinimized: (v) => set({ minimized: v }),
  setMessages: (m) =>
    set((s) => ({ messages: typeof m === "function" ? (m as any)(s.messages) : m })),
  setSending: (v) => set({ sending: v }),
  toggleSpeak: () => set((s) => ({ speakEnabled: !s.speakEnabled })),

  highlight: (selector, explanation, ms = 5200) => {
    set({ highlightSelector: selector, highlightExplanation: explanation });
    window.setTimeout(() => {
      if (get().highlightSelector === selector) {
        set({ highlightSelector: null, highlightExplanation: null });
      }
    }, ms);
  },
  clearHighlight: () => set({ highlightSelector: null, highlightExplanation: null }),
}));
