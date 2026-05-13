"use client";

import { useMemo, useState } from "react";
import { useBankConnections, useEinstellungen } from "@/hooks/useData";
import { Save, Settings, Landmark, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useAppStore } from "@/hooks/useAppStore";

type JsonRecord = Record<string, any>;

export default function EinstellungenPage() {
  const { locale } = useAppStore();
  const isGerman = locale === "de";
  const { settings, loading, updateSetting } = useEinstellungen();
  const { connections, refetch: refetchConnections } = useBankConnections();
  const [saving, setSaving] = useState<string | null>(null);
  const [hint, setHint] = useState<string>("");
  const [syncing, setSyncing] = useState(false);

  const mahnfristen = useMemo<JsonRecord>(() => settings.mahnfristen || {}, [settings.mahnfristen]);
  const benachrichtigungen = useMemo<JsonRecord>(
    () => settings.benachrichtigungen || {},
    [settings.benachrichtigungen]
  );
  const matching = useMemo<JsonRecord>(() => settings.matching || {}, [settings.matching]);

  async function save(key: string, value: JsonRecord) {
    setSaving(key);
    setHint("");
    try {
      await updateSetting(key, value);
      setHint("Einstellungen gespeichert.");
    } catch {
      setHint("Speichern fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSaving(null);
    }
  }

  async function runBankSync() {
    setSyncing(true);
    setHint("");
    try {
      const res = await fetch("/api/finapi/transactions", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setHint(isGerman ? "Bank-Sync fehlgeschlagen." : "Bank sync failed.");
      } else {
        const imported = payload.bankSync?.newTransactions ?? 0;
        setHint(
          isGerman
            ? `Bank-Sync erfolgreich: ${imported} neue Buchungen importiert.`
            : `Bank sync successful: ${imported} new bookings imported.`
        );
      }
      refetchConnections();
    } catch {
      setHint(isGerman ? "Bank-Sync fehlgeschlagen." : "Bank sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-praxis-400">Einstellungen werden geladen…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-praxis-800">Einstellungen</h1>
        <p className="text-sm text-praxis-400 mt-1">
          {isGerman
            ? "Regeln fuer Matching, Mahnungen und Benachrichtigungen."
            : "Rules for matching, reminders, and notifications."}
        </p>
      </div>

      {hint && (
        <div className="rounded-lg border border-surface-200 bg-white px-4 py-3 text-sm text-praxis-600">
          {hint}
        </div>
      )}

      <section className="stat-card space-y-4">
        <div className="flex items-center gap-2 text-praxis-700">
          <Landmark size={16} />
          <h2 className="text-sm font-semibold">{isGerman ? "Bankverbindungen" : "Bank connections"}</h2>
        </div>
        <div className="space-y-3">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="rounded-lg border border-surface-200 bg-white p-3 text-sm text-praxis-600"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-praxis-700">{conn.bank_name}</p>
                <span className={`badge ${conn.status === "connected" ? "badge-success" : "badge-warning"}`}>
                  {conn.status === "connected" ? (isGerman ? "Verbunden" : "Connected") : (isGerman ? "Update nötig" : "Update required")}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-praxis-500">
                <p>IBAN: <span className="font-mono">{conn.iban || "—"}</span></p>
                <p>{isGerman ? "Letzter Sync" : "Last sync"}: {conn.last_sync ? new Date(conn.last_sync).toLocaleString(isGerman ? "de-DE" : "en-GB") : "—"}</p>
                <p>{isGerman ? "TAN-Erneuerung" : "TAN renewal"}: {conn.tan_renewal_date ? new Date(conn.tan_renewal_date).toLocaleDateString(isGerman ? "de-DE" : "en-GB") : "—"}</p>
                <p>{isGerman ? "Anbieter" : "Provider"}: {conn.provider || "finAPI Access"}</p>
              </div>
            </div>
          ))}
          {connections.length === 0 && (
            <p className="text-sm text-praxis-400">
              {isGerman ? "Noch keine Bankverbindung hinterlegt." : "No bank connection configured yet."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary inline-flex items-center gap-2" onClick={runBankSync} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? (isGerman ? "Synchronisiere…" : "Syncing…") : isGerman ? "Bank-Sync starten" : "Start bank sync"}
          </button>
          <Link href="/zahlungen" className="btn-secondary inline-flex items-center gap-2">
            {isGerman ? "Zu Zahlungseingängen" : "Open payments"}
          </Link>
        </div>
      </section>

      <section className="stat-card space-y-4">
        <div className="flex items-center gap-2 text-praxis-700">
          <Settings size={16} />
          <h2 className="text-sm font-semibold">Mahnfristen</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <NumberField
            label="Karenz (Tage)"
            value={mahnfristen.karenz_tage ?? 5}
            onChange={(v) => (mahnfristen.karenz_tage = v)}
          />
          <NumberField
            label="Stufe 1 ab Tag"
            value={mahnfristen.stufe1_ab_tag ?? 6}
            onChange={(v) => (mahnfristen.stufe1_ab_tag = v)}
          />
          <NumberField
            label="Stufe 2 ab Tag"
            value={mahnfristen.stufe2_ab_tag ?? 21}
            onChange={(v) => (mahnfristen.stufe2_ab_tag = v)}
          />
          <NumberField
            label="Eskalation ab Tag"
            value={mahnfristen.eskalation_ab_tag ?? 42}
            onChange={(v) => (mahnfristen.eskalation_ab_tag = v)}
          />
        </div>
        <button
          className="btn-primary inline-flex items-center gap-2"
          disabled={saving === "mahnfristen"}
          onClick={() => save("mahnfristen", { ...mahnfristen })}
        >
          <Save size={14} />
          {saving === "mahnfristen" ? "Speichere…" : "Mahnfristen speichern"}
        </button>
      </section>

      <section className="stat-card space-y-4">
        <h2 className="text-sm font-semibold text-praxis-700">Matching</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <NumberField
            label="Mindestscore"
            value={matching.min_score ?? 70}
            onChange={(v) => (matching.min_score = v)}
          />
          <NumberField
            label="Auto-Freigabe ab"
            value={matching.auto_approve_score ?? 90}
            onChange={(v) => (matching.auto_approve_score = v)}
          />
          <NumberField
            label="Fuzzy-Schwelle (%)"
            value={Math.round((matching.fuzzy_threshold ?? 0.7) * 100)}
            onChange={(v) => (matching.fuzzy_threshold = v / 100)}
          />
        </div>
        <button
          className="btn-primary inline-flex items-center gap-2"
          disabled={saving === "matching"}
          onClick={() => save("matching", { ...matching })}
        >
          <Save size={14} />
          {saving === "matching" ? "Speichere…" : "Matching speichern"}
        </button>
      </section>

      <section className="stat-card space-y-4">
        <h2 className="text-sm font-semibold text-praxis-700">Benachrichtigungen</h2>
        <div className="space-y-2">
          <Toggle
            label="Automatische E-Mail-Mahnungen"
            checked={!!benachrichtigungen.auto_email}
            onChange={(v) => (benachrichtigungen.auto_email = v)}
          />
          <Toggle
            label="Automatische Brief-Mahnungen"
            checked={!!benachrichtigungen.auto_brief}
            onChange={(v) => (benachrichtigungen.auto_brief = v)}
          />
          <Toggle
            label="Sabine-Briefing aktiv"
            checked={!!benachrichtigungen.sabine_briefing}
            onChange={(v) => (benachrichtigungen.sabine_briefing = v)}
          />
          <Toggle
            label="Maria-Eskalation aktiv"
            checked={!!benachrichtigungen.maria_eskalation}
            onChange={(v) => (benachrichtigungen.maria_eskalation = v)}
          />
        </div>
        <button
          className="btn-primary inline-flex items-center gap-2"
          disabled={saving === "benachrichtigungen"}
          onClick={() => save("benachrichtigungen", { ...benachrichtigungen })}
        >
          <Save size={14} />
          {saving === "benachrichtigungen" ? "Speichere…" : "Benachrichtigungen speichern"}
        </button>
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-praxis-500 mb-1">{label}</span>
      <input
        type="number"
        className="input"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-surface-200 bg-white px-3 py-2">
      <span className="text-sm text-praxis-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
