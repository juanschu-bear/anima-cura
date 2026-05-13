"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/db/supabase";
import {
  demoAlerts,
  demoDashboardStats,
  demoPatientDetail,
  demoPatientenForList,
  demoRaten,
  demoSettings,
  demoTransaktionen,
} from "@/lib/mock-data";

const supabase = createBrowserClient();

// ─── Dashboard Stats ────────────────────────────────────────
export function useDashboardStats() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const { data } = await supabase.from("dashboard_stats").select("*").single();
        setStats(data || demoDashboardStats);
      } catch {
        setStats(demoDashboardStats);
      }
      setLoading(false);
    }
    fetch();
  }, []);

  return { stats, loading };
}

// ─── Patienten ──────────────────────────────────────────────
export function usePatienten(search?: string) {
  const [patienten, setPatienten] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("patients")
      .select("*, raten(id, status, betrag, faellig_am, mahnstufe)")
      .order("nachname", { ascending: true });

    if (search) {
      query = query.or(`nachname.ilike.%${search}%,vorname.ilike.%${search}%`);
    }

    try {
      const { data } = await query;
      setPatienten((data && data.length > 0 ? data : demoPatientenForList(search)) || []);
    } catch {
      setPatienten(demoPatientenForList(search));
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetch(); }, [fetch]);

  return { patienten, loading, refetch: fetch };
}

// ─── Einzelner Patient ──────────────────────────────────────
export function usePatient(id: string) {
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const { data } = await supabase
          .from("patients")
          .select(`
            *,
            ratenplaene(*),
            raten(*, transaktionen:transaktion_id(*)),
            mahnungen(*)
          `)
          .eq("id", id)
          .single();
        setPatient(data || demoPatientDetail(id));
      } catch {
        setPatient(demoPatientDetail(id));
      }
      setLoading(false);
    }
    fetch();
  }, [id]);

  return { patient, loading };
}

// ─── Transaktionen ──────────────────────────────────────────
export function useTransaktionen(filters?: {
  status?: string;
  from?: string;
  to?: string;
}) {
  const [transaktionen, setTransaktionen] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("transaktionen")
      .select("*, patients:matched_patient_id(vorname, nachname)")
      .order("datum", { ascending: false })
      .limit(100);

    if (filters?.status && filters.status !== "alle") {
      query = query.eq("matching_status", filters.status);
    }
    if (filters?.from) query = query.gte("datum", filters.from);
    if (filters?.to) query = query.lte("datum", filters.to);

    try {
      const { data } = await query;
      const source = data && data.length > 0 ? data : demoTransaktionen;
      const filtered = source.filter((tx: any) =>
        !filters?.status || filters.status === "alle" ? true : tx.matching_status === filters.status
      );
      setTransaktionen(filtered);
    } catch {
      const filtered = demoTransaktionen.filter((tx: any) =>
        !filters?.status || filters.status === "alle" ? true : tx.matching_status === filters.status
      );
      setTransaktionen(filtered);
    }
    setLoading(false);
  }, [filters?.status, filters?.from, filters?.to]);

  useEffect(() => { fetch(); }, [fetch]);

  return { transaktionen, loading, refetch: fetch };
}

// ─── Mahnungen ──────────────────────────────────────────────
export function useMahnungen() {
  const [mahnungen, setMahnungen] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const { data } = await supabase
          .from("mahnungen")
          .select("*, patients:patient_id(vorname, nachname, email, telefon), raten:rate_id(rate_nummer, betrag, faellig_am)")
          .order("geplant_am", { ascending: false })
          .limit(50);
        if (data && data.length > 0) setMahnungen(data);
        else {
          const demo = demoRaten
            .filter((r) => r.mahnstufe > 0)
            .map((r) => ({
              id: `m-${r.id}`,
              stufe: r.mahnstufe,
              status: "geplant",
              geplant_am: r.faellig_am,
              patients: demoPatientDetail(r.patient_id),
              raten: { rate_nummer: r.rate_nummer, betrag: r.betrag, faellig_am: r.faellig_am },
            }));
          setMahnungen(demo);
        }
      } catch {
        const demo = demoRaten
          .filter((r) => r.mahnstufe > 0)
          .map((r) => ({
            id: `m-${r.id}`,
            stufe: r.mahnstufe,
            status: "geplant",
            geplant_am: r.faellig_am,
            patients: demoPatientDetail(r.patient_id),
            raten: { rate_nummer: r.rate_nummer, betrag: r.betrag, faellig_am: r.faellig_am },
          }));
        setMahnungen(demo);
      }
      setLoading(false);
    }
    fetch();
  }, []);

  return { mahnungen, loading };
}

// ─── Alerts ─────────────────────────────────────────────────
export function useAlerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const { data } = await supabase
          .from("alerts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        setAlerts((data && data.length > 0 ? data : demoAlerts) || []);
      } catch {
        setAlerts(demoAlerts);
      }
      setLoading(false);
    }
    fetch();
  }, []);

  const markRead = async (id: string) => {
    try {
      await supabase.from("alerts").update({ gelesen: true }).eq("id", id);
    } catch {
      // mock mode
    }
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, gelesen: true } : a)));
  };

  return { alerts, loading, markRead };
}

// ─── Einstellungen ──────────────────────────────────────────
export function useEinstellungen() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const { data } = await supabase.from("einstellungen").select("key, value");
        const mapped: Record<string, any> = {};
        data?.forEach((s) => {
          mapped[s.key] = s.value;
        });
        setSettings(Object.keys(mapped).length ? mapped : demoSettings);
      } catch {
        setSettings(demoSettings);
      }
      setLoading(false);
    }
    fetch();
  }, []);

  const updateSetting = async (key: string, value: any) => {
    try {
      await supabase.from("einstellungen").update({ value }).eq("key", key);
    } catch {
      // mock mode
    }
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return { settings, loading, updateSetting };
}
