"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import { CardSkeleton } from "@/components/ui";
import { Landmark, CreditCard, Users, Receipt, ShieldAlert, ArrowLeftRight, Wallet } from "lucide-react";

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

type TabId = "konten" | "messstation";
interface KAccount { id: number; name: string; iban: string; balance: number }
interface KTransaction { id: number; accountId: number; amount: number; date: string; counterpart: string; purpose: string; category: string | null }
interface Kategorie { id: string; name: string; color: string; muster: string[] }
interface Zaehler { anzahl: number; summe: number }
interface Messwerte {
  stand: string; eingaenge: Zaehler; kzv: Zaehler; umbuchungen: Zaehler;
  terminal: Zaehler & { offen_anzahl: number; offen_summe: number; abgeglichen_anzahl: number; abgeglichen_summe: number; kreditkarte: { brutto: number; einbehalten: number; prozent: number } };
  patientengeld: { bestaetigt: Zaehler; vorschlag: Zaehler; unklar: Zaehler };
  posten: { offen_anzahl: number; offen_summe: number; teilbezahlt_anzahl: number; teilbezahlt_summe: number; mahnschutz_anzahl: number };
  geldstatus: { harte_kandidaten: Zaehler; einstufungen: Record<string, Zaehler> };
  ausgaben?: { buik: Zaehler; meta: Zaehler; kontofuehrung: Zaehler; align: Zaehler; mittwald: Zaehler };
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

const ACC_LABELS: Record<number, string> = { 31760549: "Hauptkonto", 31760546: "Betrieb", 31760547: "Privat" };
const ACC_SHORT: Record<number, string> = { 31760549: "...950", 31760546: "...976", 31760547: "...206" };

function euro(v: number): string { return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }
function euroK(v: number): string { return Math.round(v).toLocaleString("de-DE") + " €"; }
function datDE(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const dn = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${dn[new Date(+y, +m - 1, +d).getDay()]}, ${d}.${m}.${y}`;
}
function datShort(iso: string): string {
  if (!iso) return "";
  const p = iso.split("-");
  return `${p[2]}.${p[1]}.`;
}
function zahl(v: number): string { return v.toLocaleString("de-DE"); }

// Match counterpart gegen Kategorie-Muster
function matchKategorie(counterpart: string, kategorien: Kategorie[]): Kategorie | null {
  const lc = counterpart.toLowerCase();
  for (const k of kategorien) {
    for (const m of k.muster) {
      if (lc.includes(m.toLowerCase())) return k;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════
// MESSSTATION COMPONENTS (unchanged)
// ═══════════════════════════════════════════════

function FinCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "amber" | "red" | "blue" }) {
  const c = tone === "green" ? "text-accent-emerald" : tone === "amber" ? "text-accent-amber" : tone === "red" ? "text-accent-coral" : tone === "blue" ? "text-accent-blue" : "";
  return (<div className="rounded-lg border px-4 py-3"><div className="text-xs text-praxis-400">{label}</div><div className={`mt-1 text-xl font-semibold tabular-nums ${c}`}>{value}</div>{sub && <div className="mt-0.5 text-xs text-praxis-400">{sub}</div>}</div>);
}
function Abschnitt({ icon: Icon, titel, hinweis, children }: { icon: typeof Landmark; titel: string; hinweis?: string; children: React.ReactNode }) {
  return (<section className="space-y-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-praxis-400" /><h2 className="text-sm font-semibold">{titel}</h2>{hinweis && <span className="text-xs text-praxis-400">· {hinweis}</span>}</div><div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">{children}</div></section>);
}

// ═══════════════════════════════════════════════
// SCOPED CSS
// ═══════════════════════════════════════════════

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
.af{--bg:#f8f5ef;--card:#fff;--card2:#f2ede4;--t1:#1a1815;--t2:#6a6050;--t3:#a09888;--t4:#c8c0b0;--bdr:#e8e2d8;--bdr2:#d8d0c4;--gold:#b8860b;--grn:#2d7a4f;--grn-bg:#e8f5ee;--grn-bdr:#b8e0c8;--red:#b83333;--red-bg:#fceaea;--red-bdr:#e8c0c0;
  background:var(--bg);color:var(--t1);font-family:'DM Sans',sans-serif;border-radius:16px;padding:20px 18px 40px}
@media(min-width:768px){.af{padding:28px 32px 48px}}
.af *{box-sizing:border-box}
.af .serif{font-family:'Lora',serif}
.af .mono{font-family:'JetBrains Mono',monospace}
.af .hdr{text-align:center;padding:16px 0 28px;border-bottom:1px solid var(--bdr);margin-bottom:24px}
.af .hdr-lock{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--gold);background:rgba(184,134,11,.06);border:1px solid rgba(184,134,11,.18);padding:3px 12px;border-radius:12px;font-weight:500;margin-bottom:12px}
.af .hdr-val{font-family:'Lora',serif;font-size:40px;font-weight:400;color:var(--gold);letter-spacing:-1px}
@media(min-width:768px){.af .hdr-val{font-size:48px}}
.af .hdr-val span{font-size:28px;color:var(--t4)}
.af .hdr-sub{font-size:11px;color:var(--t3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px}
.af .hdr-date{font-size:11px;color:var(--t4);margin-top:8px}
.af .chips{display:flex;gap:8px;overflow-x:auto;padding:0 0 4px;margin-bottom:20px;scrollbar-width:none}
.af .chips::-webkit-scrollbar{display:none}
@media(min-width:768px){.af .chips{justify-content:center}}
.af .chip{flex-shrink:0;padding:10px 18px;border-radius:24px;border:1.5px solid var(--bdr2);background:var(--card);cursor:pointer;transition:all .2s;text-align:center}
.af .chip.on{background:var(--t1);color:var(--bg);border-color:transparent}
.af .chip-nm{font-size:11px;font-weight:500}
.af .chip-bal{font-size:15px;font-weight:600;margin-top:2px}
.af .chip.on .chip-nm{color:rgba(248,245,239,.5)}
.af .cats{background:var(--card);border:1px solid var(--bdr);border-radius:16px;padding:18px 20px;margin-bottom:16px}
.af .cats-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.af .cats-title{font-size:12px;font-weight:600;color:var(--t2)}
.af .cats-hint{font-size:10px;color:var(--t4);font-style:italic;cursor:pointer}
.af .cat{margin-bottom:10px;cursor:pointer;transition:opacity .2s}
.af .cat:last-child{margin-bottom:0}
.af .cat.dim{opacity:.25}
.af .cat-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
.af .cat-nm{font-size:12px;font-weight:500;display:flex;align-items:center;gap:6px}
.af .cat-dot{width:8px;height:8px;border-radius:3px;flex-shrink:0;display:inline-block}
.af .cat-val{font-size:11px;color:var(--t3);font-family:'JetBrains Mono',monospace}
.af .cat-track{height:5px;background:var(--card2);border-radius:3px;overflow:hidden}
.af .cat-fill{height:100%;border-radius:3px}
.af .ios{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px}
.af .io{border-radius:14px;padding:14px 16px;border:1px solid}
.af .io.inc{background:var(--grn-bg);border-color:var(--grn-bdr)}
.af .io.out{background:var(--red-bg);border-color:var(--red-bdr)}
.af .io-l{font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px}
.af .io.inc .io-l{color:rgba(45,122,79,.5)}.af .io.out .io-l{color:rgba(184,51,51,.5)}
.af .io-v{font-size:22px;font-weight:600;letter-spacing:-.5px}
.af .io.inc .io-v{color:var(--grn)}.af .io.out .io-v{color:var(--red)}
.af .io-sub{font-size:11px;margin-top:3px}
.af .io.inc .io-sub{color:rgba(45,122,79,.4)}.af .io.out .io-sub{color:rgba(184,51,51,.4)}
.af .filters{display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap}
.af .fl{font-size:11px;padding:7px 14px;border-radius:18px;border:1.5px solid var(--bdr2);background:transparent;color:var(--t3);cursor:pointer;font-family:inherit;font-weight:500;transition:all .2s}
.af .fl.on{background:var(--t1);color:var(--bg);border-color:transparent}
.af .day-label{font-size:10px;font-weight:600;color:var(--t4);letter-spacing:1px;text-transform:uppercase;padding:14px 0 6px}
.af .tx{display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--card);border-radius:14px;margin-bottom:6px;cursor:pointer;border:1px solid transparent;transition:border-color .15s}
.af .tx:hover{border-color:var(--bdr)}
.af .tx.tx-inc{background:#f0f9f4;border-color:var(--grn-bdr)}
.af .tx-bar{width:3px;height:36px;border-radius:2px;flex-shrink:0}
.af .tx-bar.inc{background:var(--grn)}.af .tx-bar.out{background:var(--red)}
.af .tx-bd{flex:1;min-width:0}
.af .tx-nm{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--t1)}
.af .tx-mt{font-size:11px;color:var(--t3);margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.af .tx-tg{font-size:10px;padding:2px 8px;border-radius:8px;font-weight:500;cursor:pointer;border:1px solid var(--bdr);transition:all .15s;position:relative}
.af .tx-tg:hover{border-color:var(--t3)}
.af .tx-tg-unset{border-style:dashed;color:var(--t4)}
.af .tx-rt{text-align:right;flex-shrink:0}
.af .tx-am{font-size:14px;font-weight:600;font-family:'JetBrains Mono',monospace}
.af .tx-am.pos{color:var(--grn)}.af .tx-am.neg{color:var(--red)}
.af .pager{display:flex;justify-content:center;align-items:center;gap:12px;padding:16px 0}
.af .pg{width:36px;height:36px;border-radius:50%;border:1.5px solid var(--bdr2);background:var(--card);color:var(--t2);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;font-family:inherit}
.af .pg:disabled{opacity:.25}
.af .pg-info{font-size:12px;color:var(--t4)}
.af .dropdown{position:absolute;top:100%;left:0;z-index:50;background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:6px;min-width:200px;box-shadow:0 8px 24px rgba(0,0,0,.08);margin-top:4px}
.af .dropdown-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:12px;transition:background .1s}
.af .dropdown-item:hover{background:var(--card2)}
.af .dropdown-sep{height:1px;background:var(--bdr);margin:4px 0}
.af .dropdown-input{width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:8px;font-size:12px;font-family:inherit;background:var(--bg);margin-top:4px}
.af .loading{text-align:center;padding:48px 0;color:var(--t4);font-size:13px}
.af .error-box{background:var(--red-bg);border:1px solid var(--red-bdr);border-radius:14px;padding:16px;color:var(--red);font-size:13px}
.af .more-btn{display:block;text-align:center;padding:10px;font-size:11px;color:var(--t4);background:none;border:1px solid var(--bdr);border-radius:12px;cursor:pointer;font-family:inherit;margin-top:4px;width:100%}
`;

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════

const PER_PAGE = 20;

export default function FinanzenPage() {
  const { locale } = useAppStore();
  const [tab, setTab] = useState<TabId>("konten");

  // Konten data
  const [accounts, setAccounts] = useState<KAccount[]>([]);
  const [rawTx, setRawTx] = useState<KTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Eigene Kategorien
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [txMap, setTxMap] = useState<Record<string, string>>({});

  // Filters
  const [selAcc, setSelAcc] = useState<number | "all">("all");
  const [dirF, setDirF] = useState<"all" | "inc" | "out">("all");
  const [catF, setCatF] = useState<string | null>(null);
  const [txPage, setTxPage] = useState(0);
  const [showAllCats, setShowAllCats] = useState(false);

  // Category assignment UI
  const [editTxId, setEditTxId] = useState<number | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const dropRef = useRef<HTMLDivElement>(null);

  // Messstation
  const [werte, setWerte] = useState<Messwerte | null>(null);
  const [messFehler, setMessFehler] = useState<string | null>(null);

  // ── Fetch Konten + Kategorien ──
  useEffect(() => {
    Promise.all([
      fetch("/api/finapi/konten?days=90").then(r => r.json()),
      fetch("/api/finapi/kategorien").then(r => r.json()),
    ]).then(([kd, katd]) => {
      if (kd.ok) { setAccounts(kd.accounts); setRawTx(kd.transactions); }
      else setError(kd.error);
      if (katd.ok) { setKategorien(katd.kategorien); setTxMap(katd.txMap ?? {}); }
    }).catch(e => setError(String(e))).finally(() => setLoading(false));
  }, []);

  // Fetch Messstation
  useEffect(() => {
    if (tab !== "messstation") return;
    createBrowserClient().rpc("ac_finanz_messwerte").then(({ data, error: e }) => {
      if (e) setMessFehler(e.message); else setWerte(data as Messwerte);
    });
  }, [tab]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setEditTxId(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Resolve category for a transaction ──
  function resolveCat(tx: KTransaction): { name: string; color: string; id: string | null } {
    // 1. Manual assignment
    const manualId = txMap[String(tx.id)];
    if (manualId) {
      const k = kategorien.find(k => k.id === manualId);
      if (k) return { name: k.name, color: k.color, id: k.id };
    }
    // 2. Muster-matching on counterpart
    const match = matchKategorie(tx.counterpart, kategorien);
    if (match) return { name: match.name, color: match.color, id: match.id };
    // 3. Not assigned
    return { name: "", color: "#ccc", id: null };
  }

  // ── Assign category to transaction ──
  async function assignCategory(txId: number, katId: string, counterpart: string) {
    setEditTxId(null);
    setTxMap(prev => ({ ...prev, [String(txId)]: katId }));
    await fetch("/api/finapi/kategorien", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "zuordnen", txId, kategorieId: katId, counterpart }),
    });
  }

  // ── Create new category ──
  async function createCategory(name: string) {
    if (!name.trim()) return;
    const colors = ["#c0392b", "#d4881e", "#2d7a4f", "#7a5e3e", "#6050a0", "#3060a0", "#b85c8a", "#4a8080"];
    const color = colors[kategorien.length % colors.length];
    const res = await fetch("/api/finapi/kategorien", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "erstellen", name: name.trim(), color }),
    });
    const d = await res.json();
    if (d.ok && d.kategorie) {
      setKategorien(prev => [...prev, d.kategorie]);
      setNewCatName("");
    }
  }

  // ── Derived data ──
  const totalBal = accounts.reduce((s, a) => s + a.balance, 0);

  // Enrich + sort: income first within same date, then by date desc
  const enriched = rawTx.map(tx => ({
    ...tx,
    dir: (tx.amount >= 0 ? "inc" : "out") as "inc" | "out",
    resolved: resolveCat(tx),
    ibanShort: ACC_SHORT[tx.accountId] ?? `#${tx.accountId}`,
  })).sort((a, b) => {
    const dc = b.date.localeCompare(a.date);
    if (dc !== 0) return dc;
    // Same date: income first
    if (a.dir === "inc" && b.dir !== "inc") return -1;
    if (a.dir !== "inc" && b.dir === "inc") return 1;
    return 0;
  });

  const filtered = enriched.filter(tx => {
    if (selAcc !== "all" && tx.accountId !== selAcc) return false;
    if (dirF === "inc" && tx.dir !== "inc") return false;
    if (dirF === "out" && tx.dir !== "out") return false;
    if (catF && tx.resolved.id !== catF) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(txPage, totalPages - 1);
  const pageTx = filtered.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE);

  // Category breakdown from OUR categories (not finAPI)
  const catBreakdown: Record<string, { name: string; color: string; amount: number; id: string }> = {};
  for (const tx of enriched) {
    if (tx.dir !== "out") continue;
    const r = tx.resolved;
    if (!r.id) continue;
    if (!catBreakdown[r.id]) catBreakdown[r.id] = { name: r.name, color: r.color, amount: 0, id: r.id };
    catBreakdown[r.id].amount += Math.abs(tx.amount);
  }
  const catEntries = Object.values(catBreakdown).sort((a, b) => b.amount - a.amount);
  const catTotal = catEntries.reduce((s, c) => s + c.amount, 0);
  const unassignedOut = enriched.filter(tx => tx.dir === "out" && !tx.resolved.id).length;

  const incTotal = enriched.filter(tx => tx.dir === "inc").reduce((s, tx) => s + tx.amount, 0);
  const outTotal = enriched.filter(tx => tx.dir === "out").reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const incCount = enriched.filter(tx => tx.dir === "inc").length;
  const outCount = enriched.filter(tx => tx.dir === "out").length;

  const reset = useCallback(() => { setDirF("all"); setCatF(null); setTxPage(0); }, []);

  // Tab bar
  const tabBar = (
    <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
      {(["konten", "messstation"] as const).map(t => (
        <button key={t} onClick={() => setTab(t)} style={{
          flex: 1, padding: "10px 16px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 500,
          cursor: "pointer", fontFamily: "inherit", transition: "all .2s",
          background: tab === t ? "#1a1815" : "#e8e2d8", color: tab === t ? "#f8f5ef" : "#6a6050",
        }}>{t === "konten" ? "Konten" : "Messstation"}</button>
      ))}
    </div>
  );

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {tab === "konten" ? (
        <div className="af">
          {tabBar}
          {loading ? <div className="loading">Wird geladen…</div> : error ? <div className="error-box">{error}</div> : (<>
            <header className="hdr">
              <div className="hdr-lock">{"🔒"} Nur Dr. Schubert</div>
              <div className="hdr-sub">Gesamtvermögen</div>
              <div className="hdr-val serif">{euroK(totalBal)}</div>
              <div className="hdr-date">Letzter Sync: {datDE(enriched[0]?.date ?? "")}</div>
            </header>

            {/* Account chips */}
            <div className="chips">
              <div className={`chip${selAcc === "all" ? " on" : ""}`} onClick={() => { setSelAcc("all"); reset(); }}>
                <div className="chip-nm">Alle Konten</div><div className="chip-bal">{euroK(totalBal)}</div>
              </div>
              {accounts.map(a => (
                <div key={a.id} className={`chip${selAcc === a.id ? " on" : ""}`} onClick={() => { setSelAcc(a.id); reset(); }}>
                  <div className="chip-nm">{ACC_LABELS[a.id] ?? a.name} {ACC_SHORT[a.id]}</div>
                  <div className="chip-bal">{euroK(a.balance)}</div>
                </div>
              ))}
            </div>

            {/* Category breakdown (OUR categories, not finAPI) */}
            {catEntries.length > 0 && (
              <div className="cats">
                <div className="cats-h">
                  <span className="cats-title">Ausgaben nach Kategorie{unassignedOut > 0 ? ` (${unassignedOut} nicht zugeordnet)` : ""}</span>
                  {catF ? <span className="cats-hint" onClick={() => { setCatF(null); setTxPage(0); }}>Filter zurücksetzen</span> : <span className="cats-hint">Tippen filtert</span>}
                </div>
                {(showAllCats ? catEntries : catEntries.slice(0, 5)).map(c => {
                  const pct = catTotal > 0 ? Math.round((c.amount / catTotal) * 100) : 0;
                  return (
                    <div key={c.id} className={`cat${catF && catF !== c.id ? " dim" : ""}`} onClick={() => { setCatF(catF === c.id ? null : c.id); setTxPage(0); }}>
                      <div className="cat-top">
                        <span className="cat-nm"><span className="cat-dot" style={{ background: c.color }} />{c.name}</span>
                        <span className="cat-val">-{euroK(c.amount)} · {pct}%</span>
                      </div>
                      <div className="cat-track"><div className="cat-fill" style={{ width: `${pct}%`, background: c.color }} /></div>
                    </div>
                  );
                })}
                {catEntries.length > 5 && (
                  <button className="more-btn" onClick={() => setShowAllCats(!showAllCats)}>
                    {showAllCats ? "Weniger" : `+ ${catEntries.length - 5} weitere`}
                  </button>
                )}
              </div>
            )}

            {/* Income / Expenses */}
            <div className="ios">
              <div className="io inc"><div className="io-l">Eingänge (90 Tage)</div><div className="io-v">+{euroK(incTotal)}</div><div className="io-sub">{incCount} Buchungen</div></div>
              <div className="io out"><div className="io-l">Ausgaben (90 Tage)</div><div className="io-v">-{euroK(outTotal)}</div><div className="io-sub">{outCount} Buchungen</div></div>
            </div>

            {/* Filter bar */}
            <div className="filters">
              {(["all", "inc", "out"] as const).map(d => (
                <button key={d} className={`fl${dirF === d ? " on" : ""}`} onClick={() => { setDirF(d); setTxPage(0); }}>
                  {d === "all" ? "Alle" : d === "inc" ? "↓ Eingänge" : "↑ Ausgaben"}
                </button>
              ))}
            </div>

            {/* Transaction list */}
            {pageTx.length === 0 ? <div style={{ textAlign: "center", padding: 32, color: "#c8c0b0", fontStyle: "italic" }}>Keine Buchungen</div> : (() => {
              let lastDay = "";
              return pageTx.map(tx => {
                const dayChanged = tx.date !== lastDay;
                if (dayChanged) lastDay = tx.date;
                const r = tx.resolved;
                return (
                  <div key={tx.id}>
                    {dayChanged && <div className="day-label">{datDE(tx.date)}</div>}
                    <div className={`tx${tx.dir === "inc" ? " tx-inc" : ""}`}>
                      <div className={`tx-bar ${tx.dir}`} />
                      <div className="tx-bd">
                        <div className="tx-nm">{tx.counterpart}</div>
                        <div className="tx-mt">
                          <span className="mono" style={{ fontSize: 11 }}>{datShort(tx.date)}</span>
                          <span>·</span>
                          <span>{tx.ibanShort}</span>
                          {/* Category tag — klickbar zum Zuordnen */}
                          <span style={{ position: "relative" }}>
                            <span
                              className={`tx-tg${!r.id ? " tx-tg-unset" : ""}`}
                              style={r.id ? { background: r.color + "18", color: r.color, borderColor: r.color + "30" } : undefined}
                              onClick={(e) => { e.stopPropagation(); setEditTxId(editTxId === tx.id ? null : tx.id); }}
                            >
                              {r.name || "Zuordnen"}
                            </span>
                            {editTxId === tx.id && (
                              <div className="dropdown" ref={dropRef} onClick={e => e.stopPropagation()}>
                                {kategorien.map(k => (
                                  <div key={k.id} className="dropdown-item" onClick={() => assignCategory(tx.id, k.id, tx.counterpart)}>
                                    <span className="cat-dot" style={{ background: k.color }} />{k.name}
                                  </div>
                                ))}
                                <div className="dropdown-sep" />
                                <input
                                  className="dropdown-input"
                                  placeholder="Neue Kategorie…"
                                  value={newCatName}
                                  onChange={e => setNewCatName(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter" && newCatName.trim()) createCategory(newCatName); }}
                                />
                              </div>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="tx-rt">
                        <div className={`tx-am ${tx.dir === "inc" ? "pos" : "neg"}`}>
                          {tx.amount >= 0 ? "+" : ""}{euro(tx.amount)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}

            {totalPages > 1 && (
              <div className="pager">
                <button className="pg" disabled={safePage === 0} onClick={() => setTxPage(safePage - 1)}>{"‹"}</button>
                <span className="pg-info">{safePage + 1} / {totalPages}</span>
                <button className="pg" disabled={safePage >= totalPages - 1} onClick={() => setTxPage(safePage + 1)}>{"›"}</button>
              </div>
            )}
          </>)}
        </div>
      ) : (
        /* ═══════ MESSSTATION TAB ═══════ */
        <div>
          <div style={{ maxWidth: "100%", margin: "0 auto", padding: "20px 18px" }}>{tabBar}</div>
          <div className="space-y-8">
            {messFehler ? <div className="rounded-lg border px-4 py-3 text-sm text-accent-coral">{messFehler}</div> : !werte ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}</div>
            ) : (() => {
              const ps = werte.patientengeld.bestaetigt.summe + werte.patientengeld.vorschlag.summe + werte.patientengeld.unklar.summe;
              const zq = ps > 0 ? Math.round((werte.patientengeld.bestaetigt.summe / ps) * 100) : 0;
              const es = Object.entries(werte.geldstatus.einstufungen).sort((a, b) => b[1].summe - a[1].summe);
              return (<>
                <Abschnitt icon={Landmark} titel={t("fin.totalSection", locale)}>
                  <FinCard label={t("fin.allIncoming", locale)} value={euro(werte.eingaenge.summe)} sub={`${zahl(werte.eingaenge.anzahl)} ${t("fin.bookings", locale)}`} />
                  <FinCard label={t("fin.kzv", locale)} value={euro(werte.kzv.summe)} sub={`${zahl(werte.kzv.anzahl)} ${t("fin.bookings", locale)}`} />
                  <FinCard label={t("fin.transfers", locale)} value={euro(werte.umbuchungen.summe)} sub={`${zahl(werte.umbuchungen.anzahl)} ${t("fin.bookings", locale)}`} />
                  <FinCard label={t("fin.patientMoney", locale)} value={euro(ps)} sub={t("fin.patientMoneySub", locale)} tone="blue" />
                </Abschnitt>
                <Abschnitt icon={Users} titel={t("fin.matchingSection", locale)} hinweis={`${zq}% ${t("fin.confirmedShare", locale)}`}>
                  <FinCard label={t("fin.confirmed", locale)} value={euro(werte.patientengeld.bestaetigt.summe)} sub={`${zahl(werte.patientengeld.bestaetigt.anzahl)} ${t("fin.payments", locale)}`} tone="green" />
                  <FinCard label={t("fin.suggested", locale)} value={euro(werte.patientengeld.vorschlag.summe)} sub={`${zahl(werte.patientengeld.vorschlag.anzahl)} ${t("fin.payments", locale)}`} tone="amber" />
                  <FinCard label={t("fin.unclear", locale)} value={euro(werte.patientengeld.unklar.summe)} sub={`${zahl(werte.patientengeld.unklar.anzahl)} ${t("fin.payments", locale)}`} />
                </Abschnitt>
                <Abschnitt icon={CreditCard} titel={t("fin.terminalSection", locale)} hinweis={t("fin.terminalHint", locale)}>
                  <FinCard label={t("fin.terminalTotal", locale)} value={euro(werte.terminal.summe)} sub={`${zahl(werte.terminal.anzahl)} ${t("fin.bundles", locale)}`} />
                  <FinCard label={t("fin.terminalOpen", locale)} value={euro(werte.terminal.offen_summe)} sub={`${zahl(werte.terminal.offen_anzahl)} ${t("fin.bundles", locale)}`} tone="amber" />
                  <FinCard label={t("fin.terminalReconciled", locale)} value={euro(werte.terminal.abgeglichen_summe)} sub={`${zahl(werte.terminal.abgeglichen_anzahl)} ${t("fin.bundles", locale)}`} tone="green" />
                  <FinCard label={t("fin.ccFees", locale)} value={euro(werte.terminal.kreditkarte.einbehalten)} sub={`${werte.terminal.kreditkarte.prozent}% von ${euro(werte.terminal.kreditkarte.brutto)}`} tone="red" />
                </Abschnitt>
                {werte.ausgaben && <Abschnitt icon={Receipt} titel={t("fin.expensesSection", locale)} hinweis={t("fin.expensesHint", locale)}>
                  <FinCard label={t("fin.expMeta", locale)} value={euro(werte.ausgaben.meta.summe)} sub={`${zahl(werte.ausgaben.meta.anzahl)} ${t("fin.debits", locale)}`} />
                  <FinCard label={t("fin.expKonto", locale)} value={euro(werte.ausgaben.kontofuehrung.summe)} sub={`${zahl(werte.ausgaben.kontofuehrung.anzahl)} ${t("fin.debits", locale)}`} />
                  <FinCard label={t("fin.expAlign", locale)} value={euro(werte.ausgaben.align.summe)} sub={`${zahl(werte.ausgaben.align.anzahl)} ${t("fin.debits", locale)}`} />
                  <FinCard label={t("fin.expMittwald", locale)} value={euro(werte.ausgaben.mittwald.summe)} sub={`${zahl(werte.ausgaben.mittwald.anzahl)} ${t("fin.debits", locale)}`} />
                </Abschnitt>}
                <Abschnitt icon={Receipt} titel={t("fin.openItemsSection", locale)}>
                  <FinCard label={t("fin.openItems", locale)} value={euro(werte.posten.offen_summe)} sub={`${zahl(werte.posten.offen_anzahl)} ${t("fin.items", locale)}`} tone="amber" />
                  <FinCard label={t("fin.partiallyPaid", locale)} value={euro(werte.posten.teilbezahlt_summe)} sub={`${zahl(werte.posten.teilbezahlt_anzahl)} ${t("fin.items", locale)}`} />
                  <FinCard label={t("fin.dunningProtected", locale)} value={zahl(werte.posten.mahnschutz_anzahl)} sub={t("fin.dunningProtectedSub", locale)} />
                  <FinCard label={t("fin.hardCandidates", locale)} value={euro(werte.geldstatus.harte_kandidaten.summe)} sub={`${zahl(werte.geldstatus.harte_kandidaten.anzahl)} ${t("fin.patientsLabel", locale)}`} tone="red" />
                </Abschnitt>
                <Abschnitt icon={ShieldAlert} titel={t("fin.statusSection", locale)}>
                  {es.map(([n, w]) => <FinCard key={n} label={n} value={euro(w.summe)} sub={`${zahl(w.anzahl)} ${t("fin.patientsLabel", locale)}`} />)}
                </Abschnitt>
                <div className="flex items-center gap-2 text-xs text-praxis-400"><ArrowLeftRight className="h-3.5 w-3.5" />{t("fin.footer", locale)}</div>
              </>);
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
