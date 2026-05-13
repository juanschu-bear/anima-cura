import { create } from "zustand";
import type { Alert, Patient, Rate, Transaktion } from "@/lib/types";

interface AppState {
  // Alerts
  alerts: Alert[];
  unreadAlertCount: number;
  setAlerts: (alerts: Alert[]) => void;
  markAlertRead: (id: string) => void;

  // Selected items
  selectedPatientId: string | null;
  setSelectedPatient: (id: string | null) => void;

  // UI
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Filter
  dateRange: { from: string; to: string };
  setDateRange: (range: { from: string; to: string }) => void;
}

export const useAppStore = create<AppState>((set) => ({
  alerts: [],
  unreadAlertCount: 0,
  setAlerts: (alerts) =>
    set({ alerts, unreadAlertCount: alerts.filter((a) => !a.gelesen).length }),
  markAlertRead: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === id ? { ...a, gelesen: true } : a)),
      unreadAlertCount: state.unreadAlertCount - 1,
    })),

  selectedPatientId: null,
  setSelectedPatient: (id) => set({ selectedPatientId: id }),

  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),

  dateRange: {
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  },
  setDateRange: (range) => set({ dateRange: range }),
}));
