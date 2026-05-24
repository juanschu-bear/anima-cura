"use client";

import { useMemo, useState } from "react";
import { Landmark, RefreshCw, Save, Settings } from "lucide-react";
import Link from "next/link";
import { DEFAULT_AUTH_USERS } from "@/lib/auth";
import { useBankConnections, useEinstellungen } from "@/hooks/useData";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

type JsonRecord = Record<string, any>;

export default function EinstellungenPage() {
  const { locale, theme } = useAppStore();
  const { settings, loading, updateSetting } = useEinstellungen();
  const { connections, refetch: refetchConnections } = useBankConnections();
  const [saving, setSaving] = useState<string | null>(null);
  const [hint, setHint] = useState("");
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
      setHint(t("settings.saved", locale));
    } catch {
      setHint(t("settings.saveError", locale));
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
        setHint(t("settings.syncFailed", locale));
      } else {
        const imported = payload.bankSync?.newTransactions ?? 0;
        setHint(t("settings.syncSuccess", locale, { imported }));
      }
      refetchConnections();
    } catch {
      setHint(t("settings.syncFailed", locale));
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm" style={{ color: "var(--ac-text-mute)" }}>
        {t("settings.loading", locale)}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="ac-page-title">{t("settings.title", locale)}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ac-text-mute)" }}>
          {t("settings.subtitle", locale)}
        </p>
      </div>

      {hint && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--ac-border)",
            background: "var(--ac-surface)",
            color: "var(--ac-text-soft)",
          }}
        >
          {hint}
        </div>
      )}

      <section
        className="rounded-lg border px-4 py-3 text-sm"
        style={{
          borderColor: "var(--ac-border)",
          background: "var(--ac-surface)",
          color: "var(--ac-text-soft)",
        }}
      >
        <p className="mb-1 font-semibold" style={{ color: "var(--ac-text)" }}>
          {t("settings.opsLogic", locale)}
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("settings.opsLogic.bullet1", locale)}</li>
          <li>{t("settings.opsLogic.bullet2", locale)}</li>
          <li>{t("settings.opsLogic.bullet3", locale)}</li>
          <li>{t("settings.opsLogic.bullet4", locale)}</li>
        </ul>
      </section>

      <section className="stat-card space-y-4">
        <div className="flex items-center gap-2" style={{ color: "var(--ac-text-soft)" }}>
          <Landmark size={16} />
          <h2 className="ac-section-title">{t("settings.bankConnection", locale)}</h2>
        </div>
        <div className="space-y-3">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="rounded-xl border p-4 text-sm"
              style={{
                borderColor: "var(--ac-border)",
                background: "var(--ac-surface-muted)",
                color: "var(--ac-text-soft)",
              }}
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <p style={{ color: "var(--ac-text-mute)" }}>{t("settings.provider", locale)}</p>
                  <p className="font-semibold" style={{ color: "var(--ac-text)" }}>
                    {conn.provider || "finAPI Access"}
                  </p>
                  <p style={{ color: "var(--ac-text-mute)" }}>{t("settings.bank", locale)}</p>
                  <p className="font-semibold" style={{ color: "var(--ac-text)" }}>
                    {conn.bank_name}
                  </p>
                  <p style={{ color: "var(--ac-text-mute)" }}>{t("settings.lastSync", locale)}</p>
                  <p className="font-semibold" style={{ color: "var(--ac-text)" }}>
                    {conn.last_sync
                      ? new Date(conn.last_sync).toLocaleString(locale === "en" ? "en-GB" : "de-DE")
                      : "—"}
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  <p style={{ color: "var(--ac-text-mute)" }}>{t("settings.bankStatus", locale)}</p>
                  <p className="font-semibold text-[#5a8d3a]">
                    ●{" "}
                    {conn.status === "connected"
                      ? t("settings.connected", locale)
                      : t("settings.updateRequired", locale)}
                  </p>
                  <p style={{ color: "var(--ac-text-mute)" }}>IBAN</p>
                  <p className="font-mono font-semibold" style={{ color: "var(--ac-text)" }}>
                    {conn.iban || "—"}
                  </p>
                  <p style={{ color: "var(--ac-text-mute)" }}>{t("settings.tanRenewal", locale)}</p>
                  <p className="font-semibold" style={{ color: "var(--ac-text)" }}>
                    {conn.tan_renewal_date
                      ? new Date(conn.tan_renewal_date).toLocaleDateString(locale === "en" ? "en-GB" : "de-DE")
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {connections.length === 0 && (
            <p className="text-sm" style={{ color: "var(--ac-text-mute)" }}>
              {t("settings.noBankConn", locale)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {connections.length === 0 && (
            <button
              className="btn-primary inline-flex items-center gap-2"
              onClick={async () => {
                const pw = prompt(t("settings.enterAdminPw", locale));
                if (!pw) return;
                setSyncing(true);
                setHint("");
                try {
                  const res = await fetch("/api/finapi/connect", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: pw }),
                  });
                  const data = await res.json();
                  if (!data.ok) {
                    setHint(data.error || t("settings.connectError", locale));
                    setSyncing(false);
                    return;
                  }
                  window.location.href = data.webFormUrl;
                } catch (err) {
                  setHint(String(err));
                  setSyncing(false);
                }
              }}
              disabled={syncing}
            >
              <Landmark size={14} />
              {syncing ? t("settings.connecting", locale) : t("settings.connectBank", locale)}
            </button>
          )}
          {connections.length > 0 && (
            <button
              className="btn-primary inline-flex items-center gap-2"
              onClick={runBankSync}
              disabled={syncing}
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? t("payments.syncing", locale) : t("settings.startBankSync", locale)}
            </button>
          )}
          <Link href="/zahlungen" className="btn-secondary inline-flex items-center gap-2">
            {t("settings.toPayments", locale)}
          </Link>
        </div>
      </section>

      <section className="stat-card space-y-4">
        <div className="flex items-center gap-2" style={{ color: "var(--ac-text-soft)" }}>
          <Settings size={16} />
          <h2 className="ac-section-title">{t("settings.dunningPeriods", locale)}</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <NumberField
            label={t("settings.gracePeriod", locale)}
            value={mahnfristen.karenz_tage ?? 5}
            onChange={(v) => (mahnfristen.karenz_tage = v)}
          />
          <NumberField
            label={t("settings.stage1From", locale)}
            value={mahnfristen.stufe1_ab_tag ?? 6}
            onChange={(v) => (mahnfristen.stufe1_ab_tag = v)}
          />
          <NumberField
            label={t("settings.stage2From", locale)}
            value={mahnfristen.stufe2_ab_tag ?? 21}
            onChange={(v) => (mahnfristen.stufe2_ab_tag = v)}
          />
          <NumberField
            label={t("settings.escalationFrom", locale)}
            value={mahnfristen.eskalation_ab_tag ?? 42}
            onChange={(v) => (mahnfristen.eskalation_ab_tag = v)}
          />
        </div>
      </section>

      <section className="stat-card space-y-4">
        <h2 className="ac-section-title">{t("settings.matching", locale)}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <NumberField
            label={t("settings.minScore", locale)}
            value={matching.min_score ?? 70}
            onChange={(v) => (matching.min_score = v)}
          />
          <NumberField
            label={t("settings.autoApproveFrom", locale)}
            value={matching.auto_approve_score ?? 90}
            onChange={(v) => (matching.auto_approve_score = v)}
          />
          <NumberField
            label={t("settings.fuzzyThreshold", locale)}
            value={Math.round((matching.fuzzy_threshold ?? 0.7) * 100)}
            onChange={(v) => (matching.fuzzy_threshold = v / 100)}
          />
        </div>
      </section>

      <section className="stat-card space-y-4">
        <h2 className="ac-section-title">{t("settings.notifications", locale)}</h2>
        <div className="space-y-2">
          <Toggle
            label={t("settings.autoEmail", locale)}
            checked={!!benachrichtigungen.auto_email}
            onChange={(v) => (benachrichtigungen.auto_email = v)}
            theme={theme}
          />
          <Toggle
            label={t("settings.autoLetter", locale)}
            checked={!!benachrichtigungen.auto_brief}
            onChange={(v) => (benachrichtigungen.auto_brief = v)}
            theme={theme}
          />
          <Toggle
            label={t("settings.sabineBriefing", locale)}
            checked={!!benachrichtigungen.sabine_briefing}
            onChange={(v) => (benachrichtigungen.sabine_briefing = v)}
            theme={theme}
          />
          <Toggle
            label={t("settings.mariaEsc", locale)}
            checked={!!benachrichtigungen.maria_eskalation}
            onChange={(v) => (benachrichtigungen.maria_eskalation = v)}
            theme={theme}
          />
        </div>
      </section>

      <section className="stat-card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="ac-section-title">{t("settings.userPerms", locale)}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--ac-text-mute)" }}>
              {t("settings.authManagedUsers", locale)}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--ac-surface-muted)" }}>
                <th className="table-header text-left">{t("settings.user", locale)}</th>
                <th className="table-header text-left">{t("settings.email", locale)}</th>
                <th className="table-header text-left">{t("settings.role", locale)}</th>
                <th className="table-header text-left">{t("settings.accessScope", locale)}</th>
                <th className="table-header text-left">{t("settings.password", locale)}</th>
              </tr>
            </thead>
            <tbody>
              {DEFAULT_AUTH_USERS.map((defaultUser) => (
                <tr key={defaultUser.email}>
                  <td className="table-cell font-semibold">{defaultUser.fullName}</td>
                  <td className="table-cell">{defaultUser.email}</td>
                  <td className="table-cell">
                    {defaultUser.role === "admin"
                      ? t("settings.admin", locale)
                      : defaultUser.role === "verwaltung"
                      ? t("settings.office", locale)
                      : t("settings.readOnly", locale)}
                  </td>
                  <td className="table-cell">
                    {defaultUser.role === "admin"
                      ? t("settings.accessAdmin", locale)
                      : defaultUser.role === "verwaltung"
                      ? t("settings.accessVerwaltung", locale)
                      : t("settings.accessReadOnly", locale)}
                  </td>
                  <td className="table-cell">{t("settings.authManagedPassword", locale)}</td>
                </tr>
              ))}
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
          {t("settings.saveSettings", locale)}
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
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--ac-text-mute)" }}>
        {label}
      </span>
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
  theme,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  theme: "light" | "dark";
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3" style={{ borderColor: "var(--ac-border)" }}>
      <span className="text-sm font-medium" style={{ color: "var(--ac-text)" }}>
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition ${
          checked
            ? "bg-[#5a8d3a]"
            : theme === "dark"
            ? "bg-white/10"
            : "bg-surface-200"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </label>
  );
}
