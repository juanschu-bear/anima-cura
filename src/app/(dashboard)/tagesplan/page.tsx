"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";

interface TerminEintrag {
  id: string;
  uhrzeit: string;
  dauer_minuten: number;
  patient_name: string;
  patient_id: string | null;
  ist_neupatient: boolean;
  behandler: string;
  behandlung_art: string | null;
  status: string;
  eingecheckt_um: string | null;
  eingecheckt_via: string | null;
  chipkarte_faellig: boolean;
  anamnesebogen_ausstehend: boolean;
  offene_rechnungen_euro: number;
  notizen: string | null;
  ist_ueberfaellig: boolean;
  dringendste_aktion: string;
}

export default function TagesplanPage() {
  const supabase = createBrowserClient();
  const authReady = useAppStore((state) => state.authReady);
  const [termine, setTermine] = useState<TerminEintrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  const loadTermine = useCallback(async () => {
    if (!authReady) return;
    const { data, error } = await supabase.from("tagesplan_heute").select("*");
    if (error) { console.error("[tagesplan]", error); return; }
    setTermine((data as TerminEintrag[]) || []);
    setLoading(false);
  }, [authReady, supabase]);

  useEffect(() => {
    if (!authReady) {
      setLoading(true);
      return;
    }
    loadTermine();
    const ch = supabase.channel("tp-rt").on("postgres_changes", { event: "*", schema: "public", table: "tagesplan_termine" }, () => loadTermine()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [authReady, supabase, loadTermine]);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    const content = document.querySelector(".ac-content") as HTMLElement;
    if (content) {
      content.style.background = "#05060e";
      content.style.padding = "28px 32px";
    }
    return () => {
      if (content) { content.style.background = ""; content.style.padding = ""; }
      link.remove();
    };
  }, []);

  async function handleCheckin(id: string) {
    setCheckingIn(id);
    await supabase.rpc("patient_checkin", { p_termin_id: id, p_via: "sabine" });
    setCheckingIn(null);
  }
  async function handleStatus(id: string, s: string) {
    await supabase.rpc("tagesplan_status_update", { p_termin_id: id, p_neuer_status: s });
  }

  const gesamt = termine.length;
  const eingecheckt = termine.filter(t => t.status === "eingecheckt").length;
  const erwartet = termine.filter(t => t.status === "erwartet").length;
  const aktionen = termine.filter(t => t.chipkarte_faellig || t.anamnesebogen_ausstehend || t.offene_rechnungen_euro > 0).length;
  const offenEuro = termine.reduce((s, t) => s + (t.offene_rechnungen_euro || 0), 0);
  const today = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  function viaLabel(v: string | null) {
    if (v === "sabine") return "Rezeption";
    if (v === "ble_beacon") return "App (automatisch)";
    if (v === "qr_scan") return "App";
    return v || "";
  }

  if (loading) return <div style={{ textAlign: "center", padding: 80, color: "rgba(255,255,255,0.2)", fontSize: 14 }}>Tagesplan wird geladen...</div>;

  return (
    <>
      <style>{`
        @keyframes ah-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(30px,-20px) scale(1.05); }
          66% { transform: translate(-20px,15px) scale(0.95); }
        }
        .ah-ambient { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
        .ah-orb { position: absolute; border-radius: 50%; filter: blur(120px); opacity: 0.3; animation: ah-drift 20s ease-in-out infinite; }
        .ah-orb-1 { width: 600px; height: 600px; top: -200px; right: -100px; background: radial-gradient(circle, rgba(74,222,128,0.15), transparent 70%); }
        .ah-orb-2 { width: 500px; height: 500px; bottom: -150px; left: -100px; background: radial-gradient(circle, rgba(34,211,238,0.1), transparent 70%); animation-delay: -7s; }
        .ah-orb-3 { width: 400px; height: 400px; top: 40%; left: 50%; background: radial-gradient(circle, rgba(167,139,250,0.08), transparent 70%); animation-delay: -13s; }

        .ah-header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 28px; position: relative; z-index: 1; }
        .ah-title { font-family: 'Space Grotesk', sans-serif; font-size: 36px; font-weight: 900; letter-spacing: -1.5px; background: linear-gradient(135deg, #f0f1f5 30%, rgba(255,255,255,0.5)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1; }
        .ah-date { font: 400 14px/1 'Inter', sans-serif; color: rgba(255,255,255,0.25); margin-top: 6px; }
        .ah-btn-add { padding: 12px 24px; font: 600 13px/1 'Inter', sans-serif; color: #05060e; background: #4ade80; border: none; border-radius: 10px; cursor: pointer; box-shadow: 0 4px 20px rgba(74,222,128,0.25), 0 0 0 1px rgba(74,222,128,0.3); transition: all 0.3s; text-decoration: none; display: inline-block; }
        .ah-btn-add:hover { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(74,222,128,0.35), 0 0 0 1px rgba(74,222,128,0.4); }

        .ah-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 28px; position: relative; z-index: 1; }
        .ah-stat { position: relative; padding: 22px 20px; background: rgba(15,17,35,0.7); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; transition: all 0.3s; cursor: default; }
        .ah-stat::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%); pointer-events: none; }
        .ah-stat:hover { border-color: rgba(255,255,255,0.1); transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
        .ah-stat-val { font-family: 'Space Grotesk', sans-serif; font-size: 30px; font-weight: 800; letter-spacing: -1px; font-variant-numeric: tabular-nums; }
        .ah-stat-lbl { font: 600 9px/1 'Inter', sans-serif; color: rgba(255,255,255,0.25); text-transform: uppercase; letter-spacing: 1.2px; margin-top: 8px; }
        .ah-stat-glow { position: absolute; bottom: -20px; right: -20px; width: 80px; height: 80px; border-radius: 50%; filter: blur(30px); opacity: 0.4; pointer-events: none; }

        .ah-rows { display: flex; flex-direction: column; gap: 8px; position: relative; z-index: 1; }
        .ah-row { display: flex; align-items: center; gap: 20px; padding: 18px 24px; background: rgba(15,17,35,0.7); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; transition: all 0.35s cubic-bezier(0.22,0.61,0.36,1); position: relative; overflow: hidden; }
        .ah-row::after { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px; border-radius: 0 2px 2px 0; opacity: 0; transition: opacity 0.3s; }
        .ah-row:hover { border-color: rgba(255,255,255,0.1); transform: translateX(4px); box-shadow: -4px 0 24px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.15); }
        .ah-row.ah-green::after { background: #4ade80; opacity: 1; }
        .ah-row.ah-green { border-color: rgba(74,222,128,0.12); background: rgba(74,222,128,0.03); }
        .ah-row.ah-violet::after { background: #a78bfa; opacity: 1; }
        .ah-row.ah-violet { border-color: rgba(167,139,250,0.12); background: rgba(167,139,250,0.03); }
        .ah-row.ah-red::after { background: #f87171; opacity: 1; }
        .ah-row.ah-red { border-color: rgba(248,113,113,0.12); background: rgba(248,113,113,0.03); }
        .ah-row.ah-dim { opacity: 0.45; }

        .ah-time { min-width: 58px; text-align: center; }
        .ah-time-t { font-family: 'Space Grotesk', sans-serif; font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
        .ah-dot { width: 7px; height: 7px; border-radius: 50%; margin: 8px auto 0; }

        .ah-info { flex: 1; min-width: 0; }
        .ah-name { font: 600 15px/1 'Inter', sans-serif; display: flex; align-items: center; gap: 8px; color: #f0f1f5; }
        .ah-badge { font: 700 8px/1 'Inter', sans-serif; padding: 3px 8px; border-radius: 5px; letter-spacing: 0.8px; text-transform: uppercase; color: #fff; background: linear-gradient(135deg, #a78bfa, #818cf8); }
        .ah-meta { font: 400 12px/1.3 'Inter', sans-serif; color: rgba(255,255,255,0.45); margin-top: 4px; }
        .ah-flags { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        .ah-f { font: 600 10px/1 'Inter', sans-serif; padding: 4px 10px; border-radius: 8px; display: flex; align-items: center; gap: 5px; }
        .ah-f::before { content: ''; width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
        .ah-f-chip { color: #fbbf24; background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.12); }
        .ah-f-chip::before { background: #fbbf24; box-shadow: 0 0 6px #fbbf24; }
        .ah-f-anam { color: #60a5fa; background: rgba(96,165,250,0.08); border: 1px solid rgba(96,165,250,0.12); }
        .ah-f-anam::before { background: #60a5fa; box-shadow: 0 0 6px #60a5fa; }
        .ah-f-pay { color: #f87171; background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.12); }
        .ah-f-pay::before { background: #f87171; box-shadow: 0 0 6px #f87171; }
        .ah-ci { font: 500 11px/1 'Inter', sans-serif; color: #4ade80; margin-top: 6px; display: flex; align-items: center; gap: 5px; }
        .ah-ci::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 8px #4ade80; }

        .ah-actions { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
        .ah-btn-go { padding: 11px 24px; font: 600 13px/1 'Inter', sans-serif; color: #05060e; background: #4ade80; border: none; border-radius: 10px; cursor: pointer; box-shadow: 0 2px 12px rgba(74,222,128,0.2); transition: all 0.25s; white-space: nowrap; }
        .ah-btn-go:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(74,222,128,0.3); }
        .ah-btn-go:disabled { opacity: 0.5; cursor: default; transform: none; }
        .ah-btn-soft { padding: 9px 18px; font: 500 12px/1 'Inter', sans-serif; color: #a78bfa; background: rgba(167,139,250,0.08); border: 1px solid rgba(167,139,250,0.15); border-radius: 10px; cursor: pointer; transition: all 0.25s; white-space: nowrap; }
        .ah-btn-soft:hover { background: rgba(167,139,250,0.14); border-color: rgba(167,139,250,0.25); }
        .ah-btn-dim { padding: 7px 14px; font: 500 11px/1 'Inter', sans-serif; color: rgba(255,255,255,0.25); background: none; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; cursor: pointer; transition: all 0.25s; white-space: nowrap; }
        .ah-btn-dim:hover { color: rgba(255,255,255,0.5); border-color: rgba(255,255,255,0.12); }
        .ah-btn-danger { padding: 7px 14px; font: 500 11px/1 'Inter', sans-serif; color: #f87171; background: none; border: 1px solid rgba(248,113,113,0.15); border-radius: 8px; cursor: pointer; transition: all 0.25s; white-space: nowrap; }
        .ah-btn-danger:hover { background: rgba(248,113,113,0.06); }
        .ah-empty { text-align: center; padding: 60px 0; color: rgba(255,255,255,0.2); font-size: 14px; }
      `}</style>

      <div className="ah-ambient">
        <div className="ah-orb ah-orb-1" />
        <div className="ah-orb ah-orb-2" />
        <div className="ah-orb ah-orb-3" />
      </div>

      <div className="ah-header">
        <div>
          <div className="ah-title">Tagesplan</div>
          <div className="ah-date">{today}</div>
        </div>
        <a href="/tagesplan/eintragen" className="ah-btn-add">+ Termin eintragen</a>
      </div>

      <div className="ah-stats">
        <div className="ah-stat">
          <div className="ah-stat-val" style={{ color: "#f0f1f5" }}>{gesamt}</div>
          <div className="ah-stat-lbl">Termine</div>
        </div>
        <div className="ah-stat">
          <div className="ah-stat-val" style={{ color: "#4ade80" }}>{eingecheckt}</div>
          <div className="ah-stat-lbl">Eingecheckt</div>
          <div className="ah-stat-glow" style={{ background: "#4ade80" }} />
        </div>
        <div className="ah-stat">
          <div className="ah-stat-val" style={{ color: "#60a5fa" }}>{erwartet}</div>
          <div className="ah-stat-lbl">Erwartet</div>
          <div className="ah-stat-glow" style={{ background: "#60a5fa" }} />
        </div>
        {aktionen > 0 && <div className="ah-stat">
          <div className="ah-stat-val" style={{ color: "#fbbf24" }}>{aktionen}</div>
          <div className="ah-stat-lbl">Aktionen</div>
          <div className="ah-stat-glow" style={{ background: "#fbbf24" }} />
        </div>}
        {offenEuro > 0 && <div className="ah-stat">
          <div className="ah-stat-val" style={{ color: "#f87171" }}>{offenEuro.toFixed(0)}&euro;</div>
          <div className="ah-stat-lbl">Offen</div>
          <div className="ah-stat-glow" style={{ background: "#f87171" }} />
        </div>}
      </div>

      {termine.length === 0 ? (
        <div className="ah-empty">Keine Termine fur heute eingetragen.</div>
      ) : (
        <div className="ah-rows">
          {termine.map(t => {
            const rc = t.status === "eingecheckt" ? "ah-green" : t.status === "in_behandlung" ? "ah-violet" : t.ist_ueberfaellig ? "ah-red" : "";
            const dc = t.status === "eingecheckt" ? "#4ade80" : t.status === "in_behandlung" ? "#a78bfa" : t.status === "fertig" ? "#6b7280" : t.ist_ueberfaellig ? "#f87171" : "#60a5fa";
            return (
              <div key={t.id} className={`ah-row ${rc} ${t.status === "fertig" ? "ah-dim" : ""}`}>
                <div className="ah-time">
                  <div className="ah-time-t">{t.uhrzeit.slice(0,5)}</div>
                  <div className="ah-dot" style={{ background: dc, boxShadow: `0 0 8px ${dc}` }} />
                </div>
                <div className="ah-info">
                  <div className="ah-name">
                    {t.patient_name}
                    {t.ist_neupatient && <span className="ah-badge">NEU</span>}
                  </div>
                  <div className="ah-meta">{t.behandler}{t.behandlung_art ? ` \u00b7 ${t.behandlung_art}` : ""}{t.dauer_minuten ? ` \u00b7 ${t.dauer_minuten} Min.` : ""}</div>
                  <div className="ah-flags">
                    {t.chipkarte_faellig && <span className="ah-f ah-f-chip">Chipkarte einlesen</span>}
                    {t.anamnesebogen_ausstehend && <span className="ah-f ah-f-anam">Anamnesebogen fehlt</span>}
                    {t.offene_rechnungen_euro > 0 && <span className="ah-f ah-f-pay">{t.offene_rechnungen_euro.toFixed(0)}&euro; offen</span>}
                  </div>
                  {t.eingecheckt_um && <div className="ah-ci">Eingecheckt um {new Date(t.eingecheckt_um).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})} via {viaLabel(t.eingecheckt_via)}</div>}
                </div>
                <div className="ah-actions">
                  {t.status === "erwartet" && <button className="ah-btn-go" disabled={checkingIn===t.id} onClick={()=>handleCheckin(t.id)}>{checkingIn===t.id ? "..." : "Patient ist da"}</button>}
                  {t.status === "eingecheckt" && <button className="ah-btn-soft" onClick={()=>handleStatus(t.id,"in_behandlung")}>In Behandlung</button>}
                  {t.status === "in_behandlung" && <button className="ah-btn-dim" onClick={()=>handleStatus(t.id,"fertig")}>Fertig</button>}
                  {t.status === "erwartet" && t.ist_ueberfaellig && <button className="ah-btn-danger" onClick={()=>handleStatus(t.id,"nicht_erschienen")}>No-Show</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
