"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import { CardSkeleton } from "@/components/ui";
import {
  Landmark, CreditCard, Users, Receipt, ShieldAlert,
  ArrowLeftRight, Wallet,
} from "lucide-react";

// ── Types ──
type TabId = "konten" | "messstation";

interface KontenAccount { id: number; name: string; iban: string; balance: number }
interface KontenTransaction {
  id: number; accountId: number; amount: number; date: string;
  counterpart: string; purpose: string; category: string | null;
}
interface KontenData { accounts: KontenAccount[]; transactions: KontenTransaction[]; totalCount: number }

interface Zaehler { anzahl: number; summe: number }
interface Messwerte {
  stand: string; eingaenge: Zaehler; kzv: Zaehler; umbuchungen: Zaehler;
  terminal: Zaehler & { offen_anzahl: number; offen_summe: number; abgeglichen_anzahl: number; abgeglichen_summe: number; kreditkarte: { brutto: number; einbehalten: number; prozent: number } };
  patientengeld: { bestaetigt: Zaehler; vorschlag: Zaehler; unklar: Zaehler };
  posten: { offen_anzahl: number; offen_summe: number; teilbezahlt_anzahl: number; teilbezahlt_summe: number; mahnschutz_anzahl: number };
  geldstatus: { harte_kandidaten: Zaehler; einstufungen: Record<string, Zaehler> };
  ausgaben?: { buik: Zaehler; meta: Zaehler; kontofuehrung: Zaehler; align: Zaehler; mittwald: Zaehler };
}

// ── Helpers ──
const ACC_LABELS: Record<number, string> = { 31760549: "Hauptkonto", 31760546: "Betrieb", 31760547: "Privat" };
const ACC_SHORT: Record<number, string> = { 31760549: "...950", 31760546: "...976", 31760547: "...206" };
const CAT_COLORS: Record<string, string> = {
  honorar: "#2d7a4f", material: "#b83333", personal: "#d4881e",
  miete: "#7a5e3e", software: "#6050a0", sonstige: "#888",
};

function euro(v: number): string {
  return `${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00A0€`;
}
function euroShort(v: number): string { return `${Math.round(v).toLocaleString("de-DE")} €`; }
function zahl(v: number): string { return v.toLocaleString("de-DE"); }
function guessCategory(cp: string, p: string): string {
  const x = `${cp} ${p}`.toLowerCase();
  if (/kzv|kassenzahn|honorar|aok|barmer|tk /.test(x)) return "honorar";
  if (/schein|dental|labor|zahntechnik/.test(x)) return "material";
  if (/gehalt|lohn/.test(x)) return "personal";
  if (/miete|stadtwerk|versicherung|strom|wasser|nebenkost/.test(x)) return "miete";
  if (/datev|software|mittwald|amazon/.test(x)) return "software";
  return "sonstige";
}

// ── Messstation sub-components (unchanged) ──
function FinCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "amber" | "red" | "blue" }) {
  const c = tone === "green" ? "text-accent-emerald" : tone === "amber" ? "text-accent-amber" : tone === "red" ? "text-accent-coral" : tone === "blue" ? "text-accent-blue" : "";
  return (<div className="rounded-lg border px-4 py-3"><div className="text-xs text-praxis-400">{label}</div><div className={`mt-1 text-xl font-semibold tabular-nums ${c}`}>{value}</div>{sub && <div className="mt-0.5 text-xs text-praxis-400">{sub}</div>}</div>);
}
function Abschnitt({ icon: Icon, titel, hinweis, children }: { icon: typeof Landmark; titel: string; hinweis?: string; children: React.ReactNode }) {
  return (<section className="space-y-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-praxis-400" /><h2 className="text-sm font-semibold">{titel}</h2>{hinweis && <span className="text-xs text-praxis-400">· {hinweis}</span>}</div><div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">{children}</div></section>);
}

// ── Scoped CSS from approved HTML mockup ──
const KONTEN_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
.af{--bg:#f8f5ef;--card:#fff;--card2:#f2ede4;--t1:#1a1815;--t2:#6a6050;--t3:#a09888;--t4:#c8c0b0;--bdr:#e8e2d8;--bdr2:#d8d0c4;--gold:#b8860b;--gold-bg:rgba(184,134,11,.06);--gold-bdr:rgba(184,134,11,.18);--grn:#2d7a4f;--grn-bg:#e8f5ee;--grn-bdr:#b8e0c8;--red:#b83333;--red-bg:#fceaea;--red-bdr:#e8c0c0;--blue-bg:#eef4fc;--blue-bdr:#c0d4e8;--blue:#3060a0;
  background:var(--bg);color:var(--t1);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;border-radius:16px;padding:20px 18px 40px;max-width:560px;margin:0 auto}
.af *{box-sizing:border-box}
.af .serif{font-family:'Lora',serif}
.af .mono{font-family:'JetBrains Mono',monospace}
.af .hdr{text-align:center;padding:16px 0 28px;border-bottom:1px solid var(--bdr);margin-bottom:24px}
.af .hdr-lock{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--gold);background:var(--gold-bg);border:1px solid var(--gold-bdr);padding:3px 12px;border-radius:12px;font-weight:500;margin-bottom:12px}
.af .hdr-label{font-size:11px;color:var(--t3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px}
.af .hdr-val{font-family:'Lora',serif;font-size:40px;font-weight:400;color:var(--gold);letter-spacing:-1px}
.af .hdr-val span{font-size:28px;color:var(--t4)}
.af .hdr-delta{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--grn);background:var(--grn-bg);padding:5px 14px;border-radius:16px;font-weight:500;margin-top:10px;border:1px solid var(--grn-bdr)}
.af .hdr-date{font-size:11px;color:var(--t4);margin-top:8px}
.af .chips{display:flex;gap:8px;overflow-x:auto;padding:0 0 4px;margin-bottom:20px;scrollbar-width:none}
.af .chips::-webkit-scrollbar{display:none}
.af .chip{flex-shrink:0;padding:10px 18px;border-radius:24px;border:1.5px solid var(--bdr2);background:var(--card);cursor:pointer;transition:all .2s;text-align:center}
.af .chip:hover{border-color:var(--t4)}
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
.af .cat:hover{opacity:.85}
.af .cat.dim{opacity:.25}
.af .cat-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
.af .cat-nm{font-size:12px;font-weight:500;color:var(--t1);display:flex;align-items:center;gap:6px}
.af .cat-dot{width:8px;height:8px;border-radius:3px;flex-shrink:0}
.af .cat-val{font-size:11px;color:var(--t3);font-family:'JetBrains Mono',monospace}
.af .cat-track{height:5px;background:var(--card2);border-radius:3px;overflow:hidden}
.af .cat-fill{height:100%;border-radius:3px;transition:width .4s}
.af .ios{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px}
.af .io{border-radius:14px;padding:14px 16px;border:1px solid}
.af .io.inc{background:var(--grn-bg);border-color:var(--grn-bdr)}
.af .io.out{background:var(--red-bg);border-color:var(--red-bdr)}
.af .io-l{font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px}
.af .io.inc .io-l{color:rgba(45,122,79,.5)}
.af .io.out .io-l{color:rgba(184,51,51,.5)}
.af .io-v{font-size:22px;font-weight:600;letter-spacing:-.5px}
.af .io.inc .io-v{color:var(--grn)}
.af .io.out .io-v{color:var(--red)}
.af .io-sub{font-size:11px;margin-top:3px}
.af .io.inc .io-sub{color:rgba(45,122,79,.4)}
.af .io.out .io-sub{color:rgba(184,51,51,.4)}
.af .insight{border-radius:16px;padding:18px 20px;margin-bottom:10px;border:1px solid}
.af .insight.positive{background:var(--grn-bg);border-color:var(--grn-bdr)}
.af .insight.warning{background:#fef8e8;border-color:#e8d8a0}
.af .insight.info{background:var(--blue-bg);border-color:var(--blue-bdr)}
.af .insight-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.af .insight-icon{font-size:18px}
.af .insight-label{font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase}
.af .insight.positive .insight-label{color:var(--grn)}
.af .insight.warning .insight-label{color:#8a6e20}
.af .insight.info .insight-label{color:var(--blue)}
.af .insight-title{font-family:'Lora',serif;font-size:17px;line-height:1.4;margin-bottom:6px;color:var(--t1)}
.af .insight-desc{font-size:12px;line-height:1.6;color:var(--t2)}
.af .filters{display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap}
.af .fl{font-size:11px;padding:7px 14px;border-radius:18px;border:1.5px solid var(--bdr2);background:transparent;color:var(--t3);cursor:pointer;font-family:inherit;font-weight:500;transition:all .2s}
.af .fl.on{background:var(--t1);color:var(--bg);border-color:transparent}
.af .fl:hover:not(.on){border-color:var(--t3);color:var(--t2)}
.af .day-label{font-size:10px;font-weight:600;color:var(--t4);letter-spacing:1px;text-transform:uppercase;padding:14px 0 6px}
.af .tx{display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--card);border-radius:14px;margin-bottom:6px;cursor:pointer;border:1px solid transparent;transition:border-color .15s}
.af .tx:hover{border-color:var(--bdr)}
.af .tx-bar{width:3px;height:36px;border-radius:2px;flex-shrink:0}
.af .tx-bar.inc{background:var(--grn)}
.af .tx-bar.out{background:var(--red)}
.af .tx-bd{flex:1;min-width:0}
.af .tx-nm{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--t1)}
.af .tx-mt{font-size:11px;color:var(--t3);margin-top:3px;display:flex;align-items:center;gap:6px}
.af .tx-tg{font-size:10px;padding:2px 8px;border-radius:8px;background:var(--card2);color:var(--t2);font-weight:500}
.af .tx-rt{text-align:right;flex-shrink:0}
.af .tx-am{font-size:14px;font-weight:600;font-family:'JetBrains Mono',monospace}
.af .tx-am.pos{color:var(--grn)}
.af .tx-am.neg{color:var(--red)}
.af .tx-empty{text-align:center;padding:32px;color:var(--t4);font-size:13px;font-family:'Lora',serif;font-style:italic}
.af .pager{display:flex;justify-content:center;align-items:center;gap:12px;padding:16px 0 8px}
.af .pg{width:36px;height:36px;border-radius:50%;border:1.5px solid var(--bdr2);background:var(--card);color:var(--t2);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;font-family:inherit;transition:all .2s}
.af .pg:hover{background:var(--card2)}
.af .pg:disabled{opacity:.25;cursor:default}
.af .pg-info{font-size:12px;color:var(--t4)}
.af .insights-sec{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
.af .loading{text-align:center;padding:48px 0;color:var(--t4);font-size:13px}
.af .error-box{background:var(--red-bg);border:1px solid var(--red-bdr);border-radius:14px;padding:16px;color:var(--red);font-size:13px}
`;

const PER_PAGE = 8;

export default function FinanzenPage() {
  const { locale } = useAppStore();
  const [tab, setTab] = useState<TabId>("konten");
  const [kontenData, setKontenData] = useState<KontenData | null>(null);
  const [kontenLoading, setKontenLoading] = useState(true);
  const [kontenError, setKontenError] = useState<string | null>(null);
  const [selectedAcc, setSelectedAcc] = useState<number | "all">("all");
  const [dirFilter, setDirFilter] = useState<"all" | "inc" | "out">("all");
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [txPage, setTxPage] = useState(0);
  const [werte, setWerte] = useState<Messwerte | null>(null);
  const [messFehler, setMessFehler] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/finapi/konten?days=90")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setKontenData(d as KontenData); else setKontenError(d.error ?? "Fehler"); })
      .catch((e) => setKontenError(String(e)))
      .finally(() => setKontenLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== "messstation") return;
    createBrowserClient().rpc("ac_finanz_messwerte").then(({ data, error }) => {
      if (error) setMessFehler(error.message); else setWerte(data as Messwerte);
    });
  }, [tab]);

  const accounts = kontenData?.accounts ?? [];
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const transactions = (kontenData?.transactions ?? []).map((tx) => ({
    ...tx,
    cat: tx.category ?? guessCategory(tx.counterpart, tx.purpose),
    dir: (tx.amount >= 0 ? "inc" : "out") as "inc" | "out",
    ibanShort: ACC_SHORT[tx.accountId] ?? `#${tx.accountId}`,
  }));

  const filteredTx = transactions.filter((tx) => {
    if (selectedAcc !== "all" && tx.accountId !== selectedAcc) return false;
    if (dirFilter === "inc" && tx.dir !== "inc") return false;
    if (dirFilter === "out" && tx.dir !== "out") return false;
    if (catFilter && tx.cat !== catFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredTx.length / PER_PAGE));
  const safePage = Math.min(txPage, totalPages - 1);
  const pageTx = filteredTx.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE);

  const catBreakdown = transactions.filter((tx) => tx.dir === "out")
    .reduce<Record<string, number>>((a, tx) => { a[tx.cat] = (a[tx.cat] ?? 0) + Math.abs(tx.amount); return a; }, {});
  const catTotal = Object.values(catBreakdown).reduce((s, v) => s + v, 0);
  const catEntries = Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]);
  const incTotal = transactions.filter((tx) => tx.dir === "inc").reduce((s, tx) => s + tx.amount, 0);
  const outTotal = transactions.filter((tx) => tx.dir === "out").reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const incCount = transactions.filter((tx) => tx.dir === "inc").length;
  const outCount = transactions.filter((tx) => tx.dir === "out").length;

  const resetFilters = useCallback(() => { setDirFilter("all"); setCatFilter(null); setTxPage(0); }, []);
  const showInsights = safePage === 0 && dirFilter === "all" && !catFilter && selectedAcc === "all";

  // Tab bar shared between both views
  const tabBar = (
    <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
      <button onClick={() => setTab("konten")} style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", background: tab === "konten" ? "#1a1815" : "#e8e2d8", color: tab === "konten" ? "#f8f5ef" : "#6a6050", transition: "all .2s" }}>
        Konten
      </button>
      <button onClick={() => setTab("messstation")} style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", background: tab === "messstation" ? "#1a1815" : "#e8e2d8", color: tab === "messstation" ? "#f8f5ef" : "#6a6050", transition: "all .2s" }}>
        Messstation
      </button>
    </div>
  );

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: KONTEN_CSS }} />

      {tab === "konten" ? (
        <div className="af">
          {tabBar}

          {kontenLoading ? (
            <div className="loading">Konten werden geladen…</div>
          ) : kontenError ? (
            <div className="error-box">{kontenError}</div>
          ) : (
            <>
              <header className="hdr">
                <div className="hdr-lock">🔒 Nur Dr. Schubert</div>
                <div className="hdr-label">Gesamtvermögen</div>
                <div className="hdr-val serif">{euroShort(totalBalance)}</div>
                {incTotal > outTotal && (
                  <div className="hdr-delta">▲ +{euroShort(incTotal - outTotal)} Netto (90 Tage)</div>
                )}
              </header>

              <div className="chips">
                <div className={`chip${selectedAcc === "all" ? " on" : ""}`} onClick={() => { setSelectedAcc("all"); resetFilters(); }}>
                  <div className="chip-nm">Alle Konten</div>
                  <div className="chip-bal">{euroShort(totalBalance)}</div>
                </div>
                {accounts.map((a) => (
                  <div key={a.id} className={`chip${selectedAcc === a.id ? " on" : ""}`} onClick={() => { setSelectedAcc(a.id); resetFilters(); }}>
                    <div className="chip-nm">{ACC_LABELS[a.id] ?? a.name} {ACC_SHORT[a.id]}</div>
                    <div className="chip-bal">{euroShort(a.balance)}</div>
                  </div>
                ))}
              </div>

              {catEntries.length > 0 && (
                <div className="cats">
                  <div className="cats-h">
                    <span className="cats-title">Ausgaben nach Kategorie</span>
                    {catFilter ? <span className="cats-hint" onClick={() => { setCatFilter(null); setTxPage(0); }}>Filter zurücksetzen</span> : <span className="cats-hint">Tippen filtert</span>}
                  </div>
                  {catEntries.map(([cat, amount]) => {
                    const pct = catTotal > 0 ? Math.round((amount / catTotal) * 100) : 0;
                    return (
                      <div key={cat} className={`cat${catFilter && catFilter !== cat ? " dim" : ""}`} onClick={() => { setCatFilter(catFilter === cat ? null : cat); setTxPage(0); }}>
                        <div className="cat-top">
                          <span className="cat-nm"><span className="cat-dot" style={{ background: CAT_COLORS[cat] ?? "#888" }} />{cat}</span>
                          <span className="cat-val">-{euroShort(amount)} · {pct}%</span>
                        </div>
                        <div className="cat-track"><div className="cat-fill" style={{ width: `${pct}%`, background: CAT_COLORS[cat] ?? "#888" }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="ios">
                <div className="io inc">
                  <div className="io-l">Eingänge</div>
                  <div className="io-v">+{euroShort(incTotal)}</div>
                  <div className="io-sub">{incCount} Buchungen</div>
                </div>
                <div className="io out">
                  <div className="io-l">Ausgaben</div>
                  <div className="io-v">-{euroShort(outTotal)}</div>
                  <div className="io-sub">{outCount} Buchungen</div>
                </div>
              </div>

              {showInsights && incTotal > 0 && (
                <div className="insights-sec">
                  <div className="insight positive">
                    <div className="insight-head"><span className="insight-icon">📈</span><span className="insight-label">Trend</span></div>
                    <div className="insight-title">Netto-Zufluss im Betrachtungszeitraum</div>
                    <div className="insight-desc">Eingänge übersteigen Ausgaben um {euroShort(Math.abs(incTotal - outTotal))}. Dr. Cashy empfiehlt, einen Teil der Überschüsse in die Rücklage zu verschieben.</div>
                  </div>
                  {catEntries.length > 0 && catEntries[0][1] > catTotal * 0.3 && (
                    <div className="insight warning">
                      <div className="insight-head"><span className="insight-icon">⚠️</span><span className="insight-label">Hinweis</span></div>
                      <div className="insight-title">{catEntries[0][0]} macht {Math.round((catEntries[0][1] / catTotal) * 100)}% aller Ausgaben</div>
                      <div className="insight-desc">{euroShort(catEntries[0][1])} für {catEntries[0][0]} — prüfe ob das im Rahmen liegt.</div>
                    </div>
                  )}
                </div>
              )}

              <div className="filters">
                {(["all", "inc", "out"] as const).map((d) => (
                  <button key={d} className={`fl${dirFilter === d ? " on" : ""}`} onClick={() => { setDirFilter(d); setTxPage(0); }}>
                    {d === "all" ? "Alle" : d === "inc" ? "↓ Eingänge" : "↑ Ausgaben"}
                  </button>
                ))}
              </div>

              {pageTx.length === 0 ? (
                <div className="tx-empty">Keine Buchungen für diesen Filter</div>
              ) : (
                <>
                  {(() => {
                    let lastDay = "";
                    return pageTx.map((tx) => {
                      const dayChanged = tx.date !== lastDay;
                      if (dayChanged) lastDay = tx.date;
                      return (
                        <div key={tx.id}>
                          {dayChanged && <div className="day-label">{tx.date}</div>}
                          <div className="tx">
                            <div className={`tx-bar ${tx.dir}`} />
                            <div className="tx-bd">
                              <div className="tx-nm">{tx.counterpart}</div>
                              <div className="tx-mt">
                                <span className="mono" style={{ fontSize: 11 }}>{tx.date}</span> · <span>{tx.ibanShort}</span>
                                <span className="tx-tg">{tx.cat}</span>
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
                </>
              )}

              {totalPages > 1 && (
                <div className="pager">
                  <button className="pg" disabled={safePage === 0} onClick={() => setTxPage(safePage - 1)}>‹</button>
                  <span className="pg-info">{safePage + 1} / {totalPages}</span>
                  <button className="pg" disabled={safePage >= totalPages - 1} onClick={() => setTxPage(safePage + 1)}>›</button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div>
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 18px" }}>
            {tabBar}
          </div>
          <div className="space-y-8">
            {messFehler ? (
              <div className="rounded-lg border px-4 py-3 text-sm text-accent-coral">{t("fin.loadError", locale)}: {messFehler}</div>
            ) : !werte ? (
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
                  <FinCard label={t("fin.ccFees", locale)} value={euro(werte.terminal.kreditkarte.einbehalten)} sub={`${werte.terminal.kreditkarte.prozent}% ${t("fin.ccFeesSub", locale)} ${euro(werte.terminal.kreditkarte.brutto)}`} tone="red" />
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
                  <FinCard label={t("fin.hardCandidates", locale)} value={euro(werte.geldstatus.harte_kandidaten.summe)} sub={`${zahl(werte.geldstatus.harte_kandidaten.anzahl)} ${t("fin.patientsLabel", locale)} · ${t("fin.hardCandidatesSub", locale)}`} tone="red" />
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
