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
        <h1 className="ac-page-title">Einstellungen</h1>
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

      <section className="rounded-lg border border-surface-200 bg-white px-4 py-3 text-sm text-praxis-600">
        <p className="font-semibold text-praxis-700 mb-1">{isGerman ? "Betriebslogik in der Praxis" : "Operational logic in practice"}</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{isGerman ? "Mahn-Pipeline wird aus überfälligen Raten automatisch berechnet (Karenz, Stufe 1, Stufe 2, Eskalation)." : "Dunning pipeline is automatically derived from overdue installments."}</li>
          <li>{isGerman ? "Benachrichtigungen/E-Mails steuerst du hier unter „Benachrichtigungen“." : "Notification and email automation is configured in the notifications section below."}</li>
          <li>{isGerman ? "Bankkonto-Anbindung läuft über finAPI. Bankdaten werden in der Bankverbindung gepflegt." : "Bank account integration runs through finAPI and is managed in bank connections."}</li>
          <li>{isGerman ? "Rollen & Rechte sind aktuell als Startset hinterlegt und können als nächster Schritt detailliert ausgebaut werden." : "Roles and permissions are currently a starter setup and can be expanded next."}</li>
        </ul>
      </section>

      <section className="stat-card space-y-4">
        <div className="flex items-center gap-2 text-praxis-700">
          <Landmark size={16} />
          <h2 className="ac-section-title">{isGerman ? "Bankverbindung" : "Bank connection"}</h2>
        </div>
        <div className="space-y-3">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="rounded-xl border border-surface-200 bg-white p-4 text-sm text-praxis-600"
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <p className="text-praxis-400">{isGerman ? "Anbieter" : "Provider"}</p>
                  <p className="font-semibold text-praxis-700">{conn.provider || "finAPI Access"}</p>
                  <p className="text-praxis-400">{isGerman ? "Bank" : "Bank"}</p>
                  <p className="font-semibold text-praxis-700">{conn.bank_name}</p>
                  <p className="text-praxis-400">{isGerman ? "Letzter Sync" : "Last sync"}</p>
                  <p className="font-semibold text-praxis-700">{conn.last_sync ? new Date(conn.last_sync).toLocaleString(isGerman ? "de-DE" : "en-GB") : "—"}</p>
                </div>
                <div className="space-y-2 text-sm">
                  <p className="text-praxis-400">{isGerman ? "Status" : "Status"}</p>
                  <p className="font-semibold text-[#5a8d3a]">● {conn.status === "connected" ? (isGerman ? "Verbunden" : "Connected") : (isGerman ? "Update nötig" : "Update required")}</p>
                  <p className="text-praxis-400">IBAN</p>
                  <p className="font-mono font-semibold text-praxis-700">{conn.iban || "—"}</p>
                  <p className="text-praxis-400">{isGerman ? "TAN-Erneuerung" : "TAN renewal"}</p>
                  <p className="font-semibold text-praxis-700">{conn.tan_renewal_date ? new Date(conn.tan_renewal_date).toLocaleDateString(isGerman ? "de-DE" : "en-GB") : "—"}</p>
                </div>
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
          <h2 className="ac-section-title">Mahnfristen</h2>
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
      </section>

      <section className="stat-card space-y-4">
        <h2 className="ac-section-title">Matching</h2>
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
      </section>

      <section className="stat-card space-y-4">
        <h2 className="ac-section-title">Benachrichtigungen</h2>
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
      </section>

      <section className="stat-card space-y-4">
        <h2 className="ac-section-title">{isGerman ? "Benutzerrechte" : "User permissions"}</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-50">
                <th className="table-header text-left">{isGerman ? "Benutzer" : "User"}</th>
                <th className="table-header text-left">{isGerman ? "Rolle" : "Role"}</th>
                <th className="table-header text-left">{isGerman ? "Zahlungen" : "Payments"}</th>
                <th className="table-header text-left">{isGerman ? "Mahnwesen" : "Dunning"}</th>
                <th className="table-header text-left">{isGerman ? "Einstellungen" : "Settings"}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="table-cell font-semibold text-praxis-700">Dr. Maria Schubert</td>
                <td className="table-cell"><span className="badge badge-info">Admin</span></td>
                <td className="table-cell">✓</td>
                <td className="table-cell">✓</td>
                <td className="table-cell">✓</td>
              </tr>
              <tr>
                <td className="table-cell font-semibold text-praxis-700">{isGerman ? "Sabine (Verwaltung)" : "Sabine (Office)"}</td>
                <td className="table-cell"><span className="badge badge-warning">{isGerman ? "Verwaltung" : "Office"}</span></td>
                <td className="table-cell">✓</td>
                <td className="table-cell">✓</td>
                <td className="table-cell">—</td>
              </tr>
              <tr>
                <td className="table-cell font-semibold text-praxis-700">{isGerman ? "Empfang" : "Reception"}</td>
                <td className="table-cell"><span className="badge badge-neutral">{isGerman ? "Lesezugriff" : "Read-only"}</span></td>
                <td className="table-cell">—</td>
                <td className="table-cell">—</td>
                <td className="table-cell">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div>
        <button
          className="btn-primary inline-flex items-center gap-2 px-6 py-3"
          disabled={saving !== null}
          onClick={async () => {
            await save("mahnfristen", { ...mahnfristen });
            await save("matching", { ...matching });
            await save("benachrichtigungen", { ...benachrichtigungen });
          }}
        >
          <Save size={14} />
          {isGerman ? "Einstellungen speichern" : "Save settings"}
        </button>
      </div>
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
    <label className="flex items-center justify-between rounded-lg border border-surface-200 bg-white px-3 py-3">
      <span className="text-sm text-praxis-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition-colors ${checked ? "bg-[#5b4de1]" : "bg-surface-200"}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-6" : "left-1"}`}
        />
      </button>
    </label>
  );
}
