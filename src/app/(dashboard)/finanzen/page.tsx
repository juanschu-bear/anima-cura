"use client";

// ============================================================
// FINANZEN – Privates Finanz-Dashboard (nur Admin/Dr. Schubert)
// Tab 1: Konten (3 private Bankkonten, Insights, Transaktionen)
// Tab 2: Messstation (bestehende KZV/Terminal/Patientengeld-Daten)
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import { CardSkeleton } from "@/components/ui";
import {
  Landmark,
  CreditCard,
  Users,
  Receipt,
  ShieldAlert,
  ArrowLeftRight,
  Wallet,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Lock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ── Types ──

type TabId = "konten" | "messstation";

interface KontenAccount {
  id: number;
  name: string;
  iban: string;
  balance: number;
}

interface KontenTransaction {
  id: number;
  accountId: number;
  amount: number;
  date: string;
  counterpart: string;
  purpose: string;
  category: string | null;
}

interface KontenData {
  accounts: KontenAccount[];
  transactions: KontenTransaction[];
  totalCount: number;
}

interface Zaehler {
  anzahl: number;
  summe: number;
}

interface Messwerte {
  stand: string;
  eingaenge: Zaehler;
  kzv: Zaehler;
  umbuchungen: Zaehler;
  terminal: Zaehler & {
    offen_anzahl: number;
    offen_summe: number;
    abgeglichen_anzahl: number;
    abgeglichen_summe: number;
    kreditkarte: { brutto: number; einbehalten: number; prozent: number };
  };
  patientengeld: {
    bestaetigt: Zaehler;
    vorschlag: Zaehler;
    unklar: Zaehler;
  };
  posten: {
    offen_anzahl: number;
    offen_summe: number;
    teilbezahlt_anzahl: number;
    teilbezahlt_summe: number;
    mahnschutz_anzahl: number;
  };
  geldstatus: {
    harte_kandidaten: Zaehler;
    einstufungen: Record<string, Zaehler>;
  };
  ausgaben?: {
    buik: Zaehler;
    meta: Zaehler;
    kontofuehrung: Zaehler;
    align: Zaehler;
    mittwald: Zaehler;
  };
}

// ── Helpers ──

const ACCOUNT_LABELS: Record<number, string> = {
  31760549: "Hauptkonto",
  31760546: "Betrieb",
  31760547: "Privat",
};

const ACCOUNT_IBANS_SHORT: Record<number, string> = {
  31760549: "...950",
  31760546: "...976",
  31760547: "...206",
};

function euro(value: number, locale: string = "de"): string {
  return `${value.toLocaleString(locale === "en" ? "en-GB" : "de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}\u00A0€`;
}

function euroShort(value: number): string {
  return `${Math.round(value).toLocaleString("de-DE")} €`;
}

function zahl(value: number, locale: string = "de"): string {
  return value.toLocaleString(locale === "en" ? "en-GB" : "de-DE");
}

function guessCategory(counterpart: string, purpose: string): string {
  const text = `${counterpart} ${purpose}`.toLowerCase();
  if (text.includes("kzv") || text.includes("kassenzahn") || text.includes("honorar")) return "honorar";
  if (text.includes("aok") || text.includes("barmer") || text.includes("tk ")) return "honorar";
  if (text.includes("schein") || text.includes("dental") || text.includes("labor") || text.includes("zahntechnik")) return "material";
  if (text.includes("gehalt") || text.includes("lohn")) return "personal";
  if (text.includes("miete") || text.includes("stadtwerk") || text.includes("versicherung") || text.includes("strom")) return "miete";
  if (text.includes("datev") || text.includes("software") || text.includes("mittwald")) return "software";
  return "sonstige";
}

const CAT_COLORS: Record<string, string> = {
  honorar: "bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20",
  material: "bg-accent-coral/10 text-accent-coral border-accent-coral/20",
  personal: "bg-accent-amber/10 text-accent-amber border-accent-amber/20",
  miete: "bg-accent-blue/10 text-accent-blue border-accent-blue/20",
  software: "bg-accent-violet/10 text-accent-violet border-accent-violet/20",
  sonstige: "bg-praxis-100 text-praxis-500 border-praxis-200",
};

const CAT_BAR_COLORS: Record<string, string> = {
  honorar: "bg-accent-emerald",
  material: "bg-accent-coral",
  personal: "bg-accent-amber",
  miete: "bg-accent-blue",
  software: "bg-accent-violet",
  sonstige: "bg-praxis-300",
};

// ── Sub-components ──

function FinCard({
  label, value, sub, tone,
}: {
  label: string; value: string; sub?: string;
  tone?: "green" | "amber" | "red" | "blue";
}) {
  const toneClass = tone === "green" ? "text-accent-emerald" : tone === "amber" ? "text-accent-amber" : tone === "red" ? "text-accent-coral" : tone === "blue" ? "text-accent-blue" : "";
  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="text-xs text-praxis-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-praxis-400">{sub}</div> : null}
    </div>
  );
}

function Abschnitt({
  icon: Icon, titel, hinweis, children,
}: {
  icon: typeof Landmark; titel: string; hinweis?: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-praxis-400" />
        <h2 className="text-sm font-semibold">{titel}</h2>
        {hinweis ? <span className="text-xs text-praxis-400">· {hinweis}</span> : null}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

// ── Page ──

const PER_PAGE = 8;

export default function FinanzenPage() {
  const { locale } = useAppStore();
  const [tab, setTab] = useState<TabId>("konten");

  // Konten state
  const [kontenData, setKontenData] = useState<KontenData | null>(null);
  const [kontenLoading, setKontenLoading] = useState(true);
  const [kontenError, setKontenError] = useState<string | null>(null);
  const [selectedAcc, setSelectedAcc] = useState<number | "all">("all");
  const [dirFilter, setDirFilter] = useState<"all" | "inc" | "out">("all");
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [txPage, setTxPage] = useState(0);

  // Messstation state
  const [werte, setWerte] = useState<Messwerte | null>(null);
  const [messFehler, setMessFehler] = useState<string | null>(null);

  // Fetch Konten data
  useEffect(() => {
    fetch("/api/finapi/konten?days=90")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setKontenData(d as KontenData);
        else setKontenError(d.error ?? "Konten konnten nicht geladen werden");
      })
      .catch((e) => setKontenError(String(e)))
      .finally(() => setKontenLoading(false));
  }, []);

  // Fetch Messstation data
  useEffect(() => {
    if (tab !== "messstation") return;
    const supabase = createBrowserClient();
    supabase.rpc("ac_finanz_messwerte").then(({ data, error }) => {
      if (error) setMessFehler(error.message);
      else setWerte(data as Messwerte);
    });
  }, [tab]);

  // Derived Konten values
  const accounts = kontenData?.accounts ?? [];
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  const transactions = (kontenData?.transactions ?? []).map((tx) => ({
    ...tx,
    cat: tx.category ?? guessCategory(tx.counterpart, tx.purpose),
    dir: tx.amount >= 0 ? ("inc" as const) : ("out" as const),
    ibanShort: ACCOUNT_IBANS_SHORT[tx.accountId] ?? `#${tx.accountId}`,
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

  // Category breakdown (expenses only)
  const catBreakdown = transactions
    .filter((tx) => tx.dir === "out")
    .reduce<Record<string, number>>((acc, tx) => {
      acc[tx.cat] = (acc[tx.cat] ?? 0) + Math.abs(tx.amount);
      return acc;
    }, {});
  const catTotal = Object.values(catBreakdown).reduce((s, v) => s + v, 0);
  const catEntries = Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]);

  const incomeTotal = transactions.filter((tx) => tx.dir === "inc").reduce((s, tx) => s + tx.amount, 0);
  const expenseTotal = transactions.filter((tx) => tx.dir === "out").reduce((s, tx) => s + Math.abs(tx.amount), 0);

  const resetFilters = useCallback(() => {
    setDirFilter("all");
    setCatFilter(null);
    setTxPage(0);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Finanzen</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-accent-amber/20 bg-accent-amber/5 px-2.5 py-0.5 text-[10px] font-medium text-accent-amber">
              <Lock className="h-3 w-3" /> Nur Dr. Schubert
            </span>
          </div>
          <p className="text-sm text-praxis-400">Konten, Insights und Cashflow</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-praxis-50 p-1">
        <button
          onClick={() => setTab("konten")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "konten" ? "bg-white shadow-sm" : "text-praxis-400 hover:text-praxis-600"
          }`}
        >
          <Wallet className="mr-1.5 inline h-4 w-4" />Konten
        </button>
        <button
          onClick={() => setTab("messstation")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "messstation" ? "bg-white shadow-sm" : "text-praxis-400 hover:text-praxis-600"
          }`}
        >
          <Landmark className="mr-1.5 inline h-4 w-4" />Messstation
        </button>
      </div>

      {/* ═══════ TAB: KONTEN ═══════ */}
      {tab === "konten" && (
        <div className="space-y-5">
          {kontenLoading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : kontenError ? (
            <div className="rounded-lg border border-accent-coral/20 bg-accent-coral/5 px-4 py-3 text-sm text-accent-coral">
              {kontenError}
            </div>
          ) : (
            <>
              {/* Total balance */}
              <div className="text-center">
                <div className="text-xs text-praxis-400 tracking-wider uppercase">Gesamtvermögen</div>
                <div className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: "#b8860b" }}>
                  {euro(totalBalance, locale)}
                </div>
              </div>

              {/* Account chips */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => { setSelectedAcc("all"); resetFilters(); }}
                  className={`flex-shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    selectedAcc === "all" ? "border-transparent bg-praxis-800 text-white" : "border-praxis-200 hover:border-praxis-300"
                  }`}
                >
                  Alle · {euroShort(totalBalance)}
                </button>
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => { setSelectedAcc(acc.id); resetFilters(); }}
                    className={`flex-shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                      selectedAcc === acc.id ? "border-transparent bg-praxis-800 text-white" : "border-praxis-200 hover:border-praxis-300"
                    }`}
                  >
                    <span className="font-medium">{ACCOUNT_LABELS[acc.id] ?? acc.name}</span>
                    <span className="ml-1.5 text-xs opacity-60">{ACCOUNT_IBANS_SHORT[acc.id]}</span>
                    <span className="ml-2 font-semibold tabular-nums">{euroShort(acc.balance)}</span>
                  </button>
                ))}
              </div>

              {/* Category bars */}
              {catEntries.length > 0 && (
                <div className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-praxis-400">Ausgaben nach Kategorie</h3>
                    {catFilter && (
                      <button onClick={() => { setCatFilter(null); setTxPage(0); }} className="text-xs text-accent-blue hover:underline">
                        Filter zurücksetzen
                      </button>
                    )}
                  </div>
                  {catEntries.map(([cat, amount]) => {
                    const pct = catTotal > 0 ? Math.round((amount / catTotal) * 100) : 0;
                    const isDim = catFilter !== null && catFilter !== cat;
                    return (
                      <div
                        key={cat}
                        onClick={() => { setCatFilter(catFilter === cat ? null : cat); setTxPage(0); }}
                        className={`mb-2.5 cursor-pointer last:mb-0 transition-opacity ${isDim ? "opacity-25" : "hover:opacity-80"}`}
                      >
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium capitalize">{cat}</span>
                          <span className="tabular-nums text-praxis-400 font-mono text-[11px]">
                            -{euroShort(amount)} · {pct}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-praxis-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${CAT_BAR_COLORS[cat] ?? "bg-praxis-300"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Income / Expense summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-accent-emerald/20 bg-accent-emerald/5 p-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-accent-emerald/50">Eingänge</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-accent-emerald">+{euroShort(incomeTotal)}</div>
                  <div className="mt-0.5 text-[11px] text-accent-emerald/40">
                    {transactions.filter((tx) => tx.dir === "inc").length} Buchungen
                  </div>
                </div>
                <div className="rounded-lg border border-accent-coral/20 bg-accent-coral/5 p-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-accent-coral/50">Ausgaben</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-accent-coral">-{euroShort(expenseTotal)}</div>
                  <div className="mt-0.5 text-[11px] text-accent-coral/40">
                    {transactions.filter((tx) => tx.dir === "out").length} Buchungen
                  </div>
                </div>
              </div>

              {/* Insight cards */}
              {selectedAcc === "all" && dirFilter === "all" && !catFilter && txPage === 0 && incomeTotal > 0 && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-accent-emerald/20 bg-accent-emerald/5 p-4">
                    <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-accent-emerald">
                      <TrendingUp className="h-3.5 w-3.5" /> Trend
                    </div>
                    <div className="text-sm font-medium">Netto-Zufluss im Betrachtungszeitraum</div>
                    <div className="mt-1 text-xs text-praxis-400 leading-relaxed">
                      Eingänge übersteigen Ausgaben um {euroShort(incomeTotal - expenseTotal)}.
                      Dr. Cashy empfiehlt, einen Teil der Überschüsse in die Rücklage zu verschieben.
                    </div>
                  </div>
                  {catEntries.length > 0 && catEntries[0][1] > catTotal * 0.3 && (
                    <div className="rounded-lg border border-accent-amber/20 bg-accent-amber/5 p-4">
                      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-accent-amber">
                        <AlertTriangle className="h-3.5 w-3.5" /> Hinweis
                      </div>
                      <div className="text-sm font-medium">
                        {catEntries[0][0]} macht {Math.round((catEntries[0][1] / catTotal) * 100)}% aller Ausgaben
                      </div>
                      <div className="mt-1 text-xs text-praxis-400 leading-relaxed">
                        {euroShort(catEntries[0][1])} für {catEntries[0][0]} — prüfe ob das im Rahmen liegt.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Filter bar */}
              <div className="flex flex-wrap gap-2">
                {(["all", "inc", "out"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => { setDirFilter(d); setTxPage(0); }}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      dirFilter === d ? "border-transparent bg-praxis-800 text-white" : "border-praxis-200 text-praxis-400 hover:border-praxis-300"
                    }`}
                  >
                    {d === "all" ? "Alle" : d === "inc" ? "↓ Eingänge" : "↑ Ausgaben"}
                  </button>
                ))}
              </div>

              {/* Transaction list */}
              <div className="space-y-1.5">
                {pageTx.length === 0 ? (
                  <div className="rounded-lg border px-4 py-8 text-center text-sm italic text-praxis-400">
                    Keine Buchungen für diesen Filter
                  </div>
                ) : (
                  pageTx.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-praxis-50">
                      <div className={`h-9 w-1 flex-shrink-0 rounded-full ${tx.dir === "inc" ? "bg-accent-emerald" : "bg-accent-coral"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{tx.counterpart}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-praxis-400">
                          <span className="font-mono">{tx.date}</span>
                          <span>·</span>
                          <span>{tx.ibanShort}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${CAT_COLORS[tx.cat] ?? ""}`}>
                            {tx.cat}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className={`text-sm font-semibold tabular-nums font-mono ${tx.dir === "inc" ? "text-accent-emerald" : "text-accent-coral"}`}>
                          {tx.amount >= 0 ? "+" : ""}{euro(tx.amount, locale)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pager */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setTxPage(Math.max(0, safePage - 1))}
                    disabled={safePage === 0}
                    className="rounded-full border p-2 text-praxis-400 transition-colors hover:bg-praxis-50 disabled:opacity-25"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-praxis-400">{safePage + 1} / {totalPages}</span>
                  <button
                    onClick={() => setTxPage(Math.min(totalPages - 1, safePage + 1))}
                    disabled={safePage >= totalPages - 1}
                    className="rounded-full border p-2 text-praxis-400 transition-colors hover:bg-praxis-50 disabled:opacity-25"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════ TAB: MESSSTATION ═══════ */}
      {tab === "messstation" && (
        <div className="space-y-8">
          {messFehler ? (
            <div className="rounded-lg border px-4 py-3 text-sm text-accent-coral">
              {t("fin.loadError", locale)}: {messFehler}
            </div>
          ) : !werte ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : (
            <>
              {(() => {
                const patientengeldSumme = werte.patientengeld.bestaetigt.summe + werte.patientengeld.vorschlag.summe + werte.patientengeld.unklar.summe;
                const zugeordnetQuote = patientengeldSumme > 0 ? Math.round((werte.patientengeld.bestaetigt.summe / patientengeldSumme) * 100) : 0;
                const einstufungen = Object.entries(werte.geldstatus.einstufungen).sort((a, b) => b[1].summe - a[1].summe);

                return (
                  <>
                    <Abschnitt icon={Landmark} titel={t("fin.totalSection", locale)}>
                      <FinCard label={t("fin.allIncoming", locale)} value={euro(werte.eingaenge.summe, locale)} sub={`${zahl(werte.eingaenge.anzahl, locale)} ${t("fin.bookings", locale)}`} />
                      <FinCard label={t("fin.kzv", locale)} value={euro(werte.kzv.summe, locale)} sub={`${zahl(werte.kzv.anzahl, locale)} ${t("fin.bookings", locale)}`} />
                      <FinCard label={t("fin.transfers", locale)} value={euro(werte.umbuchungen.summe, locale)} sub={`${zahl(werte.umbuchungen.anzahl, locale)} ${t("fin.bookings", locale)}`} />
                      <FinCard label={t("fin.patientMoney", locale)} value={euro(patientengeldSumme, locale)} sub={t("fin.patientMoneySub", locale)} tone="blue" />
                    </Abschnitt>

                    <Abschnitt icon={Users} titel={t("fin.matchingSection", locale)} hinweis={`${zugeordnetQuote}% ${t("fin.confirmedShare", locale)}`}>
                      <FinCard label={t("fin.confirmed", locale)} value={euro(werte.patientengeld.bestaetigt.summe, locale)} sub={`${zahl(werte.patientengeld.bestaetigt.anzahl, locale)} ${t("fin.payments", locale)}`} tone="green" />
                      <FinCard label={t("fin.suggested", locale)} value={euro(werte.patientengeld.vorschlag.summe, locale)} sub={`${zahl(werte.patientengeld.vorschlag.anzahl, locale)} ${t("fin.payments", locale)}`} tone="amber" />
                      <FinCard label={t("fin.unclear", locale)} value={euro(werte.patientengeld.unklar.summe, locale)} sub={`${zahl(werte.patientengeld.unklar.anzahl, locale)} ${t("fin.payments", locale)}`} />
                    </Abschnitt>

                    <Abschnitt icon={CreditCard} titel={t("fin.terminalSection", locale)} hinweis={t("fin.terminalHint", locale)}>
                      <FinCard label={t("fin.terminalTotal", locale)} value={euro(werte.terminal.summe, locale)} sub={`${zahl(werte.terminal.anzahl, locale)} ${t("fin.bundles", locale)}`} />
                      <FinCard label={t("fin.terminalOpen", locale)} value={euro(werte.terminal.offen_summe, locale)} sub={`${zahl(werte.terminal.offen_anzahl, locale)} ${t("fin.bundles", locale)}`} tone="amber" />
                      <FinCard label={t("fin.terminalReconciled", locale)} value={euro(werte.terminal.abgeglichen_summe, locale)} sub={`${zahl(werte.terminal.abgeglichen_anzahl, locale)} ${t("fin.bundles", locale)}`} tone="green" />
                      <FinCard label={t("fin.ccFees", locale)} value={euro(werte.terminal.kreditkarte.einbehalten, locale)} sub={`${werte.terminal.kreditkarte.prozent}% ${t("fin.ccFeesSub", locale)} ${euro(werte.terminal.kreditkarte.brutto, locale)}`} tone="red" />
                    </Abschnitt>

                    {werte.ausgaben && (
                      <Abschnitt icon={Receipt} titel={t("fin.expensesSection", locale)} hinweis={t("fin.expensesHint", locale)}>
                        <FinCard label={t("fin.expMeta", locale)} value={euro(werte.ausgaben.meta.summe, locale)} sub={`${zahl(werte.ausgaben.meta.anzahl, locale)} ${t("fin.debits", locale)}`} />
                        <FinCard label={t("fin.expKonto", locale)} value={euro(werte.ausgaben.kontofuehrung.summe, locale)} sub={`${zahl(werte.ausgaben.kontofuehrung.anzahl, locale)} ${t("fin.debits", locale)}`} />
                        <FinCard label={t("fin.expAlign", locale)} value={euro(werte.ausgaben.align.summe, locale)} sub={`${zahl(werte.ausgaben.align.anzahl, locale)} ${t("fin.debits", locale)}`} />
                        <FinCard label={t("fin.expMittwald", locale)} value={euro(werte.ausgaben.mittwald.summe, locale)} sub={`${zahl(werte.ausgaben.mittwald.anzahl, locale)} ${t("fin.debits", locale)}`} />
                      </Abschnitt>
                    )}

                    <Abschnitt icon={Receipt} titel={t("fin.openItemsSection", locale)}>
                      <FinCard label={t("fin.openItems", locale)} value={euro(werte.posten.offen_summe, locale)} sub={`${zahl(werte.posten.offen_anzahl, locale)} ${t("fin.items", locale)}`} tone="amber" />
                      <FinCard label={t("fin.partiallyPaid", locale)} value={euro(werte.posten.teilbezahlt_summe, locale)} sub={`${zahl(werte.posten.teilbezahlt_anzahl, locale)} ${t("fin.items", locale)}`} />
                      <FinCard label={t("fin.dunningProtected", locale)} value={zahl(werte.posten.mahnschutz_anzahl, locale)} sub={t("fin.dunningProtectedSub", locale)} />
                      <FinCard label={t("fin.hardCandidates", locale)} value={euro(werte.geldstatus.harte_kandidaten.summe, locale)} sub={`${zahl(werte.geldstatus.harte_kandidaten.anzahl, locale)} ${t("fin.patientsLabel", locale)} · ${t("fin.hardCandidatesSub", locale)}`} tone="red" />
                    </Abschnitt>

                    <Abschnitt icon={ShieldAlert} titel={t("fin.statusSection", locale)}>
                      {einstufungen.map(([name, wert]) => (
                        <FinCard key={name} label={name} value={euro(wert.summe, locale)} sub={`${zahl(wert.anzahl, locale)} ${t("fin.patientsLabel", locale)}`} />
                      ))}
                    </Abschnitt>

                    <div className="flex items-center gap-2 text-xs text-praxis-400">
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      {t("fin.footer", locale)}
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
