"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";

const supabase = createBrowserClient();

function normalizePatientSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildSearchVariants(input: string) {
  const base = normalizePatientSearch(input);
  const compact = base.replace(/\s+/g, " ").trim();
  const variants = new Set<string>([compact]);
  if (compact.includes("ae")) variants.add(compact.replace(/ae/g, "a"));
  if (compact.includes("oe")) variants.add(compact.replace(/oe/g, "o"));
  if (compact.includes("ue")) variants.add(compact.replace(/ue/g, "u"));
  if (compact.includes("ss")) variants.add(compact.replace(/ss/g, "s"));
  return Array.from(variants).filter(Boolean);
}

function rankPatientMatch(patient: any, search: string) {
  const variants = buildSearchVariants(search);
  const fullName = normalizePatientSearch(`${patient.nachname ?? ""} ${patient.vorname ?? ""}`);
  const reversedName = normalizePatientSearch(`${patient.vorname ?? ""} ${patient.nachname ?? ""}`);
  const lastName = normalizePatientSearch(patient.nachname ?? "");
  const firstName = normalizePatientSearch(patient.vorname ?? "");
  const patientNumber = String(patient.ivoris_nummer ?? "").toLowerCase();

  let best = Number.POSITIVE_INFINITY;
  for (const variant of variants) {
    if (patientNumber && patientNumber === variant) best = Math.min(best, 0);
    else if (lastName && lastName === variant) best = Math.min(best, 1);
    else if (fullName && fullName === variant) best = Math.min(best, 2);
    else if (reversedName && reversedName === variant) best = Math.min(best, 3);
    else if (patientNumber && patientNumber.includes(variant)) best = Math.min(best, 4);
    else if (lastName && lastName.startsWith(variant)) best = Math.min(best, 5);
    else if (fullName && fullName.startsWith(variant)) best = Math.min(best, 6);
    else if (reversedName && reversedName.startsWith(variant)) best = Math.min(best, 7);
    else if (lastName && lastName.includes(variant)) best = Math.min(best, 8);
    else if (firstName && firstName.includes(variant)) best = Math.min(best, 9);
    else if (fullName && fullName.includes(variant)) best = Math.min(best, 10);
    else if (reversedName && reversedName.includes(variant)) best = Math.min(best, 11);
  }

  return best;
}

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
  const authReady = useAppStore((state) => state.authReady);
  const [patienten, setPatienten] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!authReady) return;
    setLoading(true);
    setError(null);

    // Gesamtzahl holen (unabhängig vom Limit)
    const { count } = await supabase
      .from("patients")
      .select("*", { count: "exact", head: true });
    setTotalCount(count || 0);

    let query = supabase
      .from("patients")
      .select("*, raten(id, status, betrag, faellig_am, mahnstufe)", { count: "exact" })
      .order("nachname", { ascending: true })
      .range(0, 9999);

    if (search) {
      const variants = buildSearchVariants(search);
      const muster = Array.from(new Set(variants.flatMap((variant) => [
        `nachname.ilike.%${variant}%`,
        `vorname.ilike.%${variant}%`,
        `ivoris_nummer.ilike.%${variant}%`,
      ]))).join(",");
      query = query.or(muster);
    }

    const { data, error: queryError } = await query;

    if (queryError) {
      setError(queryError.message);
      setPatienten([]);
    } else {
      const rows = data || [];
      if (search?.trim()) {
        const normalizedSearch = search.trim();
        rows.sort((a, b) => {
          const rankA = rankPatientMatch(a, normalizedSearch);
          const rankB = rankPatientMatch(b, normalizedSearch);
          if (rankA !== rankB) return rankA - rankB;
          const lastNameCompare = String(a.nachname ?? "").localeCompare(String(b.nachname ?? ""), "de");
          if (lastNameCompare !== 0) return lastNameCompare;
          return String(a.vorname ?? "").localeCompare(String(b.vorname ?? ""), "de");
        });
      }
      setPatienten(rows);
    }

    setLoading(false);
  }, [authReady, search]);

  useEffect(() => {
    if (!authReady) {
      setLoading(true);
      return;
    }
    fetch();
  }, [authReady, fetch]);

  return { patienten, totalCount, loading, error, refetch: fetch };
}

// ─── Einzelner Patient ──────────────────────────────────────
export function usePatient(id: string) {
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      const { data, error: queryError } = await supabase
        .from("patients")
        .select(`
          *,
          ratenplaene(*),
          raten(*),
          mahnungen(*)
        `)
        .eq("id", id)
        .single();

      if (queryError) {
        setError(queryError.message);
      } else {
        setPatient(data);
      }
      setLoading(false);
    }
    fetch();
  }, [id]);

  return { patient, loading, error };
}

// ─── Transaktionen ──────────────────────────────────────────
export function useTransaktionen(filters?: {
  status?: string;
  kasse?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  suche?: string;
}) {
  const [transaktionen, setTransaktionen] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const pageSize = filters?.pageSize ?? 100;
    const page = filters?.page ?? 1;
    const fromIdx = (page - 1) * pageSize;
    const kasse = filters?.kasse;
    // Bei BEMA/GOZ-Filter inner join auf den zugeordneten Patienten, sonst normaler Join.
    const sel = kasse && kasse !== "alle"
      ? "*, patients:matched_patient_id!inner(vorname, nachname, kasse)"
      : "*, patients:matched_patient_id(vorname, nachname, kasse)";
    let query = supabase
      .from("transaktionen")
      .select(sel, { count: "exact" })
      .order("datum", { ascending: false })
      .range(fromIdx, fromIdx + pageSize - 1);

    if (filters?.status && filters.status !== "alle") {
      query = query.eq("matching_status", filters.status);
    }
    if (kasse && kasse !== "alle") {
      query = query.eq("patients.kasse", kasse);
    }
    if (filters?.from) query = query.gte("datum", filters.from);
    if (filters?.to) query = query.lte("datum", filters.to);

    // Serverseitige Suche ueber Absender, Verwendungszweck und Betrag.
    // Kommas/Klammern wuerden die PostgREST-or()-Syntax brechen -> raus.
    const suchbegriff = (filters?.suche || "").trim();
    if (suchbegriff) {
      const istZahl = /^[0-9]+([.,][0-9]{1,2})?$/.test(suchbegriff);
      const sauber = suchbegriff.replace(/[%,()*]/g, " ").trim();
      const teile: string[] = [];
      if (sauber) {
        teile.push(`verwendungszweck.ilike.*${sauber}*`);
        teile.push(`absender_name.ilike.*${sauber}*`);
      }
      if (istZahl) {
        teile.push(`betrag.eq.${suchbegriff.replace(",", ".")}`);
      }
      if (teile.length) query = query.or(teile.join(","));
    }

    const { data, count } = await query;
    setTransaktionen(data || []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [filters?.status, filters?.kasse, filters?.from, filters?.to, filters?.page, filters?.pageSize, filters?.suche]);

  useEffect(() => { fetch(); }, [fetch]);

  return { transaktionen, totalCount, loading, refetch: fetch };
}

// ─── Transaktions-Statistiken (serverseitig ueber ALLE Zeilen) ──
export function useTransaktionenStats() {
  const [stats, setStats] = useState({
    total: 0, auto: 0, manuell: 0, vorschlag: 0, unklar: 0, ignoriert: 0,
    incomingToday: 0, oldestDate: null as string | null,
  });
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [totalRes, autoRes, manuellRes, unklarRes, abwRes, ignRes, todayRes, oldestRes] = await Promise.all([
      supabase.from("transaktionen").select("id", { count: "exact", head: true }),
      supabase.from("transaktionen").select("id", { count: "exact", head: true }).eq("matching_status", "auto"),
      supabase.from("transaktionen").select("id", { count: "exact", head: true }).eq("matching_status", "manuell"),
      supabase.from("transaktionen").select("id", { count: "exact", head: true }).eq("matching_status", "unklar"),
      supabase.from("transaktionen").select("id", { count: "exact", head: true }).eq("matching_status", "abweichung"),
      supabase.from("transaktionen").select("id", { count: "exact", head: true }).eq("matching_status", "ignoriert"),
      supabase.from("transaktionen").select("betrag").gte("datum", today),
      supabase.from("transaktionen").select("datum").order("datum", { ascending: true }).limit(1),
    ]);
    const incomingToday = (todayRes.data || []).reduce(
      (sum: number, row: { betrag: number | null }) => sum + Number(row.betrag || 0),
      0
    );
    setStats({
      total: totalRes.count ?? 0,
      auto: autoRes.count ?? 0,
      manuell: manuellRes.count ?? 0,
      vorschlag: abwRes.count ?? 0,
      unklar: unklarRes.count ?? 0,
      ignoriert: ignRes.count ?? 0,
      incomingToday,
      oldestDate: oldestRes.data?.[0]?.datum ?? null,
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { stats, loading, refetch: fetch };
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
      data?.forEach((s) => {
        mapped[s.key] = s.value;
      });
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

// ─── Bankverbindungen ──────────────────────────────────────
export function useBankConnections() {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("bank_connections")
      .select("*")
      .order("created_at", { ascending: false });
    setConnections(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { connections, loading, refetch: fetch };
}
