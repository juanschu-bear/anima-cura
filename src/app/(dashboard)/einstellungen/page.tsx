"use client";

import { useMemo, useState } from "react";
import { useBankConnections, useEinstellungen } from "@/hooks/useData";
import { Save, Settings, Landmark, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";

type JsonRecord = Record<string, any>;

export default function EinstellungenPage() {
  const { locale } = useAppStore();
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);

  const ADMIN_PW = "ms13sr06?!";

  if (!unlocked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-2xl border p-8 text-center" style={{ borderColor: "var(--ac-border)", background: "var(--ac-surface)", boxShadow: "var(--ac-shadow)" }}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--ac-surface-muted)" }}>
            <Settings size={24} style={{ color: "var(--ac-text-mute)" }} />
          </div>
          <h2 className="text-xl font-bold" style={{ color: "var(--ac-text)" }}>
            {t("settings.title", locale)}
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--ac-text-soft)" }}>
            {t("settings.enterPassword", locale)}
          </p>
          <input
            type="password"
            className="input mt-4"
            placeholder="••••••••"
            value={pwInput}
            onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (pwInput === ADMIN_PW) setUnlocked(true);
                else setPwError(true);
              }
            }}
            autoFocus
          />
          {pwError && (
            <p className="mt-2 text-sm" style={{ color: "var(--ac-danger)" }}>
              {t("settings.wrongPassword", locale)}
            </p>
          )}
          <button
            className="btn-primary mt-4 w-full"
            onClick={() => {
              if (pwInput === ADMIN_PW) setUnlocked(true);
              else setPwError(true);
            }}
          >
            {t("settings.unlock", locale)}
          </button>
        </div>
      </div>
    );
  }

  return <EinstellungenContent />;
}

function EinstellungenContent() {
  const { locale, theme } = useAppStore();
  const ADMIN_PW = "ms13sr06?!";
  const { settings, loading, updateSetting } = useEinstellungen();
  const { connections, refetch: refetchConnections } = useBankConnections();
  const [saving, setSaving] = useState<string | null>(null);
  const [hint, setHint] = useState<string>("");
  const [syncing, setSyncing] = useState(false);

  interface UserEntry {
    name: string;
    role: string;
    password: string;
    permissions: { zahlungen: boolean; mahnwesen: boolean; einstellungen: boolean };
  }

  const [users, setUsers] = useState<UserEntry[]>([
    { name: "Dr. Maria Schubert", role: "admin", password: "", permissions: { zahlungen: true, mahnwesen: true, einstellungen: true } },
    { name: "Sabine (Verwaltung)", role: "verwaltung", password: "", permissions: { zahlungen: true, mahnwesen: true, einstellungen: false } },
    { name: "Empfang", role: "lesezugriff", password: "", permissions: { zahlungen: false, mahnwesen: false, einstellungen: false } },
  ]);

  function updateUser(idx: number, field: string, value: any) {
    setUsers((prev) => prev.map((u, i) => {
      if (i !== idx) return u;
      if (field === "name") return { ...u, name: value };
      if (field === "role") {
        const perms = value === "admin"
          ? { zahlungen: true, mahnwesen: true, einstellungen: true }
          : value === "verwaltung"
          ? { zahlungen: true, mahnwesen: true, einstellungen: false }
          : { zahlungen: false, mahnwesen: false, einstellungen: false };
        return { ...u, role: value, permissions: perms };
      }
      if (field === "password") return { ...u, password: value };
      if (["zahlungen", "mahnwesen", "einstellungen"].includes(field)) {
        return { ...u, permissions: { ...u.permissions, [field]: value } };
      }
      return u;
    }));
  }

  function addUser() {
    setUsers((prev) => [...prev, { name: "", role: "lesezugriff", password: "", permissions: { zahlungen: false, mahnwesen: false, einstellungen: false } }]);
  }

  function removeUser(idx: number) {
    setUsers((prev) => prev.filter((_, i) => i !== idx));
  }

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
    return <p className="text-sm" style={{ color: "var(--ac-text-mute)" }}>{t("settings.loading", locale)}</p>;
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
        <p className="mb-1 font-semibold" style={{ color: "var(--ac-text)" }}>{t("settings.opsLogic", locale)}</p>
        <ul className="list-disc pl-5 space-y-1">
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
                  <p className="font-semibold" style={{ color: "var(--ac-text)" }}>{conn.provider || "finAPI Access"}</p>
                  <p style={{ color: "var(--ac-text-mute)" }}>{t("settings.bank", locale)}</p>
                  <p className="font-semibold" style={{ color: "var(--ac-text)" }}>{conn.bank_name}</p>
                  <p style={{ color: "var(--ac-text-mute)" }}>{t("settings.lastSync", locale)}</p>
                  <p className="font-semibold" style={{ color: "var(--ac-text)" }}>{conn.last_sync ? new Date(conn.last_sync).toLocaleString(locale === "en" ? "en-GB" : "de-DE") : "—"}</p>
                </div>
                <div className="space-y-2 text-sm">
                  <p style={{ color: "var(--ac-text-mute)" }}>{t("settings.bankStatus", locale)}</p>
                  <p className="font-semibold text-[#5a8d3a]">● {conn.status === "connected" ? t("settings.connected", locale) : t("settings.updateRequired", locale)}</p>
                  <p style={{ color: "var(--ac-text-mute)" }}>IBAN</p>
                  <p className="font-mono font-semibold" style={{ color: "var(--ac-text)" }}>{conn.iban || "—"}</p>
                  <p style={{ color: "var(--ac-text-mute)" }}>{t("settings.tanRenewal", locale)}</p>
                  <p className="font-semibold" style={{ color: "var(--ac-text)" }}>{conn.tan_renewal_date ? new Date(conn.tan_renewal_date).toLocaleDateString(locale === "en" ? "en-GB" : "de-DE") : "—"}</p>
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
                  // Redirect to finAPI Web Form
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
            <button className="btn-primary inline-flex items-center gap-2" onClick={runBankSync} disabled={syncing}>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
        <h2 className="ac-section-title">{t("settings.userPerms", locale)}</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--ac-surface-muted)" }}>
                <th className="table-header text-left">{t("settings.user", locale)}</th>
                <th className="table-header text-left">{t("settings.role", locale)}</th>
                <th className="table-header text-left">{t("settings.permPayments", locale)}</th>
                <th className="table-header text-left">{t("settings.permDunning", locale)}</th>
                <th className="table-header text-left">{t("settings.permSettings", locale)}</th>
                <th className="table-header text-left">{t("settings.password", locale)}</th>
                <th className="table-header text-left"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, idx) => (
                <tr key={idx}>
                  <td className="table-cell">
                    <input className="input text-sm font-semibold" value={user.name} onChange={(e) => updateUser(idx, "name", e.target.value)} style={{ maxWidth: 200 }} />
                  </td>
                  <td className="table-cell">
                    <select className="input text-sm" value={user.role} onChange={(e) => updateUser(idx, "role", e.target.value)}>
                      <option value="admin">{t("settings.admin", locale)}</option>
                      <option value="verwaltung">{t("settings.office", locale)}</option>
                      <option value="lesezugriff">{t("settings.readOnly", locale)}</option>
                    </select>
                  </td>
                  <td className="table-cell text-center">
                    <input type="checkbox" checked={user.permissions.zahlungen} onChange={(e) => updateUser(idx, "zahlungen", e.target.checked)} />
                  </td>
                  <td className="table-cell text-center">
                    <input type="checkbox" checked={user.permissions.mahnwesen} onChange={(e) => updateUser(idx, "mahnwesen", e.target.checked)} />
                  </td>
                  <td className="table-cell text-center">
                    <input type="checkbox" checked={user.permissions.einstellungen} onChange={(e) => updateUser(idx, "einstellungen", e.target.checked)} />
                  </td>
                  <td className="table-cell">
                    <input type="password" className="input text-sm" placeholder="••••••" value={user.password || ""} onChange={(e) => updateUser(idx, "password", e.target.value)} style={{ maxWidth: 120 }} />
                  </td>
                  <td className="table-cell">
                    {idx > 0 && (
                      <button className="text-xs text-accent-coral hover:underline" onClick={() => removeUser(idx)}>
                        {t("common.remove", locale)}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="mt-3 btn-secondary inline-flex items-center gap-1.5 text-sm"
            onClick={addUser}
          >
            + {t("settings.addUser", locale)}
          </button>
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
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--ac-text-mute)" }}>{label}</span>
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
    <label
      className="flex items-center justify-between rounded-lg border px-3 py-3"
      style={{
        borderColor: "var(--ac-border)",
        background: "var(--ac-surface-muted)",
      }}
    >
      <span className="text-sm" style={{ color: "var(--ac-text)" }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition-colors ${checked ? "bg-[#5b4de1]" : ""}`}
        style={!checked ? { background: theme === "dark" ? "#2b3447" : "#dfe5ef" } : undefined}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-6" : "left-1"}`}
        />
      </button>
    </label>
  );
}
