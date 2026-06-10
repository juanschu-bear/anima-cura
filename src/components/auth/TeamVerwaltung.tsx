"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAppStore } from "@/hooks/useAppStore";
import { MODULE, STUFEN, effektiveStufe, type Stufe } from "@/lib/permissions";

// Team & Zugaenge – zentrale Benutzerverwaltung der Plattform.
// Wohnt in Anima Cura (Einstellungen), nutzt die plattformweiten /api/team-Routen.
// Nur fuer Admins sichtbar (Aufrufer prueft das ueber die Rolle).

type Mitglied = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  kuerzel: string | null;
  permissions?: { scribe_schreiben?: boolean; module?: Record<string, string> } | null;
};

const ROLLEN = [
  { wert: "admin", label: "Admin" },
  { wert: "verwaltung", label: "Verwaltung" },
  { wert: "lesezugriff", label: "Lesezugriff" },
];

function PwFeld({
  wert,
  setzen,
  platzhalter,
  onEnter,
}: {
  wert: string;
  setzen: (v: string) => void;
  platzhalter: string;
  onEnter?: () => void;
}) {
  const [sichtbar, setSichtbar] = useState(false);
  return (
    <div className="relative">
      <input
        type={sichtbar ? "text" : "password"}
        className="input pr-10"
        value={wert}
        placeholder={platzhalter}
        autoComplete="new-password"
        onChange={(e) => setzen(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      />
      <button
        type="button"
        aria-label={sichtbar ? "Passwort verbergen" : "Passwort anzeigen"}
        onClick={() => setSichtbar((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
        style={{ color: "var(--ac-text-mute)" }}
      >
        {sichtbar ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export default function TeamVerwaltung() {
  const { authUser } = useAppStore();
  const istAdmin = authUser?.role === "admin";

  const [mitglieder, setMitglieder] = useState<Mitglied[]>([]);
  const [mailDomain, setMailDomain] = useState("praxis-schubert.de");
  const [hinweis, setHinweis] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [geladen, setGeladen] = useState(false);

  const [neu, setNeu] = useState({ name: "", lokal: "", rolle: "verwaltung", kuerzel: "", passwort: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [editRolle, setEditRolle] = useState("verwaltung");
  const [editKuerzel, setEditKuerzel] = useState("");
  const [editScribe, setEditScribe] = useState(false);
  const [editModule, setEditModule] = useState<Record<string, Stufe>>({});
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");

  async function laden() {
    setHinweis(null);
    const res = await fetch("/api/team");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setHinweis({ ok: false, text: json.error ?? "Team konnte nicht geladen werden." });
      setGeladen(true);
      return;
    }
    setMitglieder(json.mitglieder ?? []);
    if (json.mail_domain) setMailDomain(json.mail_domain);
    setGeladen(true);
  }

  useEffect(() => {
    if (istAdmin) laden();
  }, [istAdmin]);

  async function anlegen() {
    setHinweis(null);
    setLaeuft(true);
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(neu),
    });
    const json = await res.json().catch(() => ({}));
    setLaeuft(false);
    if (!res.ok) {
      setHinweis({ ok: false, text: json.error ?? "Anlegen fehlgeschlagen." });
      return;
    }
    setNeu({ name: "", lokal: "", rolle: "verwaltung", kuerzel: "", passwort: "" });
    setHinweis({ ok: true, text: `${json.mitglied.email} angelegt.` });
    laden();
  }

  function bearbeitenStarten(m: Mitglied) {
    setEditId(m.id);
    setEditRolle(m.role);
    setEditKuerzel(m.kuerzel ?? "");
    setEditScribe(m.permissions?.scribe_schreiben ?? ["admin", "verwaltung"].includes(m.role));
    const stufen: Record<string, Stufe> = {};
    for (const mod of MODULE) stufen[mod.schluessel] = effektiveStufe(m.role as never, m.permissions ?? null, mod.schluessel);
    setEditModule(stufen);
    setResetId(null);
  }

  async function speichern(id: string) {
    setHinweis(null);
    setLaeuft(true);
    const res = await fetch(`/api/team/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rolle: editRolle, kuerzel: editKuerzel, scribe_schreiben: editScribe, module_stufen: editModule }),
    });
    const json = await res.json().catch(() => ({}));
    setLaeuft(false);
    if (!res.ok) {
      setHinweis({ ok: false, text: json.error ?? "Speichern fehlgeschlagen." });
      return;
    }
    setEditId(null);
    laden();
  }

  async function passwortSetzen(id: string) {
    setHinweis(null);
    if (resetPw.length < 8) {
      setHinweis({ ok: false, text: "Passwort: mindestens 8 Zeichen." });
      return;
    }
    setLaeuft(true);
    const res = await fetch(`/api/team/${id}/passwort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passwort: resetPw }),
    });
    const json = await res.json().catch(() => ({}));
    setLaeuft(false);
    if (!res.ok) {
      setHinweis({ ok: false, text: json.error ?? "Passwort-Reset fehlgeschlagen." });
      return;
    }
    setResetId(null);
    setResetPw("");
    setHinweis({ ok: true, text: "Passwort gesetzt." });
  }

  if (!istAdmin) {
    return (
      <section className="stat-card space-y-2">
        <h2 className="ac-section-title">Team &amp; Zugänge</h2>
        <p className="text-sm" style={{ color: "var(--ac-text-mute)" }}>
          Die Benutzerverwaltung ist Administratoren vorbehalten.
        </p>
      </section>
    );
  }

  return (
    <section className="stat-card space-y-4">
      <div>
        <h2 className="ac-section-title">Team &amp; Zugänge</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--ac-text-mute)" }}>
          Zentrale Benutzerverwaltung für Anima Cura und Anima Scribe. Konten, Rollen, Kürzel, Passwörter und Modulrechte.
        </p>
      </div>

      {hinweis && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            background: hinweis.ok ? "rgba(34,160,107,.12)" : "rgba(214,69,69,.12)",
            color: hinweis.ok ? "#1f8f5f" : "#c23b3b",
          }}
        >
          {hinweis.text}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ background: "var(--ac-surface-muted)" }}>
              <th className="table-header text-left">Konto</th>
              <th className="table-header text-left">Kürzel</th>
              <th className="table-header text-left">Rolle</th>
              <th className="table-header text-left">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {!geladen && (
              <tr>
                <td className="table-cell" colSpan={4} style={{ color: "var(--ac-text-mute)" }}>
                  Lädt …
                </td>
              </tr>
            )}
            {mitglieder.map((m) => (
              <tr key={m.id}>
                <td className="table-cell">
                  <div className="font-semibold">{m.display_name}</div>
                  <div className="text-xs" style={{ color: "var(--ac-text-mute)" }}>{m.email}</div>
                </td>
                <td className="table-cell font-mono">{m.kuerzel ?? "—"}</td>
                <td className="table-cell">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: "var(--ac-surface-muted)", color: "var(--ac-text)" }}
                  >
                    {m.role}
                  </span>
                  {m.permissions?.scribe_schreiben === true && m.role === "lesezugriff" && (
                    <span className="ml-2 text-xs" style={{ color: "#2e6fe6" }}>+ Scribe</span>
                  )}
                </td>
                <td className="table-cell">
                  <div className="flex flex-wrap gap-2">
                    {resetId === m.id ? (
                      <div className="flex items-center gap-2">
                        <div className="w-44">
                          <PwFeld wert={resetPw} setzen={setResetPw} platzhalter="Neues Passwort" onEnter={() => passwortSetzen(m.id)} />
                        </div>
                        <button className="btn-primary" disabled={laeuft} onClick={() => passwortSetzen(m.id)}>OK</button>
                        <button className="btn-secondary" onClick={() => { setResetId(null); setResetPw(""); }}>Abbruch</button>
                      </div>
                    ) : (
                      <>
                        <button className="btn-secondary" onClick={() => bearbeitenStarten(m)}>Bearbeiten</button>
                        <button className="btn-secondary" onClick={() => { setResetId(m.id); setResetPw(""); setEditId(null); }}>Passwort</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editId && (
        <div className="space-y-4 rounded-xl border p-4" style={{ borderColor: "var(--ac-border)" }}>
          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium" style={{ color: "var(--ac-text-mute)" }}>Rolle</span>
              <select className="input" value={editRolle} onChange={(e) => setEditRolle(e.target.value)}>
                {ROLLEN.map((r) => <option key={r.wert} value={r.wert}>{r.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium" style={{ color: "var(--ac-text-mute)" }}>Kürzel</span>
              <input className="input w-24" value={editKuerzel} onChange={(e) => setEditKuerzel(e.target.value)} placeholder="z. B. ms" />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={editScribe} onChange={(e) => setEditScribe(e.target.checked)} />
              Scribe: dokumentieren &amp; ivoris
            </label>
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold">Anima-Cura-Modulrechte</p>
            <p className="mb-3 text-xs" style={{ color: "var(--ac-text-mute)" }}>
              Stufe pro Modul, übersteuert die Rolle. Sichtbarkeit und Seitenzugriff gelten sofort, die Schreib-Sperren in den Modulen folgen schrittweise.
            </p>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {MODULE.map((mod) => (
                <label key={mod.schluessel} className="flex items-center justify-between gap-2 text-sm">
                  <span>{mod.label}</span>
                  <select
                    className="input w-28"
                    value={editModule[mod.schluessel] ?? "keine"}
                    onChange={(e) => setEditModule({ ...editModule, [mod.schluessel]: e.target.value as Stufe })}
                  >
                    {STUFEN.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary" disabled={laeuft} onClick={() => speichern(editId)}>Speichern</button>
            <button className="btn-secondary" onClick={() => setEditId(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--ac-border)" }}>
        <p className="text-sm font-semibold">Neues Teammitglied</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input" value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} placeholder="Name, z. B. Dr. Maria Schubert" />
          <div className="flex items-center gap-2">
            <input className="input flex-1" value={neu.lokal} onChange={(e) => setNeu({ ...neu, lokal: e.target.value })} placeholder="vorname" />
            <span className="whitespace-nowrap text-sm" style={{ color: "var(--ac-text-mute)" }}>@{mailDomain}</span>
          </div>
          <select className="input" value={neu.rolle} onChange={(e) => setNeu({ ...neu, rolle: e.target.value })}>
            {ROLLEN.map((r) => <option key={r.wert} value={r.wert}>{r.label}</option>)}
          </select>
          <input className="input" value={neu.kuerzel} onChange={(e) => setNeu({ ...neu, kuerzel: e.target.value })} placeholder="Kürzel, z. B. ms" />
          <PwFeld wert={neu.passwort} setzen={(v) => setNeu({ ...neu, passwort: v })} platzhalter="Startpasswort (mind. 8 Zeichen)" />
        </div>
        <button className="btn-primary" disabled={laeuft} onClick={anlegen}>{laeuft ? "Arbeitet …" : "Anlegen"}</button>
      </div>
    </section>
  );
}
