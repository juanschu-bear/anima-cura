"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/db/supabase";

const supabase = createBrowserClient();

// ─── Dashboard Stats ────────────────────────────────────────
export function useDashboardStats() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from("dashboard_stats").select("*").single();
      setStats(data);
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

    const { data } = await query;
    setPatienten(data || []);
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
      setPatient(data);
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

    const { data } = await query;
    setTransaktionen(data || []);
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
      const { data } = await supabase
        .from("mahnungen")
        .select("*, patients:patient_id(vorname, nachname, email, telefon), raten:rate_id(rate_nummer, betrag, faellig_am)")
        .order("geplant_am", { ascending: false })
        .limit(50);
      setMahnungen(data || []);
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
      const { data } = await supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      setAlerts(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  const markRead = async (id: string) => {
    await supabase.from("alerts").update({ gelesen: true }).eq("id", id);
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
      const { data } = await supabase.from("einstellungen").select("key, value");
      const mapped: Record<string, any> = {};
      data?.forEach((s) => { mapped[s.key] = s.value; });
      setSettings(mapped);
      setLoading(false);
    }
    fetch();
  }, []);

  const updateSetting = async (key: string, value: any) => {
    await supabase.from("einstellungen").update({ value }).eq("key", key);
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return { settings, loading, updateSetting };
}
