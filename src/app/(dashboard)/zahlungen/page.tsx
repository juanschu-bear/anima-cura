"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePatienten, useTransaktionen } from "@/hooks/useData";
import { EmptyState, Modal, StatusBadge } from "@/components/ui";
import { ArrowRight, Check, CreditCard, Search, X } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";
import { useAppStore } from "@/hooks/useAppStore";

export default function ZahlungenPage() {
  const router = useRouter();
  const { locale } = useAppStore();
  const isGerman = locale === "de";

  const [statusFilter, setStatusFilter] = useState("alle");
  const { transaktionen, refetch } = useTransaktionen({ status: statusFilter });
  const [matchModal, setMatchModal] = useState<any>(null);
  const [patSearch, setPatSearch] = useState("");
  const { patienten } = usePatienten(patSearch);
  const [syncing, setSyncing] = useState(false);
  const [syncHint, setSyncHint] = useState("");
  const [statusHelpFor, setStatusHelpFor] = useState<string | null>(null);
  const [statusHelpPos, setStatusHelpPos] = useState<{ left: number; top: number } | null>(null);
  const [clientTx, setClientTx] = useState<any[]>([]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("status");
    if (status) setStatusFilter(status);
  }, []);

  useEffect(() => {
    setClientTx(transaktionen);
  }, [transaktionen]);

  const metrics = useMemo(() => {
    const total = clientTx.length;
    const auto = clientTx.filter((t) => t.matching_status === "auto").length;
    const unclear = clientTx.filter((t) => t.matching_status === "unklar" || t.matching_status === "abweichung").length;
    const today = new Date().toISOString().slice(0, 10);
    const incomingToday = clientTx
      .filter((t) => t.datum?.slice?.(0, 10) === today)
      .reduce((sum, t) => sum + Number(t.betrag || 0), 0);

    return {
      total,
      auto,
      unclear,
      incomingToday,
      autoRate: total > 0 ? Math.round((auto / total) * 100) : 0,
    };
  }, [clientTx]);

  async function handleManualMatch(txId: string, patientId: string) {
    const selectedPatient = patienten.find((p) => p.id === patientId);
    const supabase = createBrowserClient();
    const { error } = await supabase
      .from("transaktionen")
      .update({ matching_status: "manuell", matched_patient_id: patientId, matching_score: 100 })
      .eq("id", txId);
    if (error) {
      setSyncHint(isGerman ? "Backend nicht erreichbar - lokal zugeordnet." : "Backend not reachable - assigned locally.");
    } else {
      setSyncHint(isGerman ? "Transaktion manuell zugeordnet." : "Transaction assigned manually.");
    }
    setClientTx((prev) =>
      prev.map((tx) =>
        tx.id === txId
          ? {
              ...tx,
              matching_status: "manuell",
              matched_patient_id: patientId,
              matching_score: 100,
              patients: selectedPatient
                ? { vorname: selectedPatient.vorname, nachname: selectedPatient.nachname }
                : tx.patients,
            }
          : tx
      )
    );
    setMatchModal(null);
    refetch();
  }

  async function handleIgnore(txId: string) {
    const supabase = createBrowserClient();
    const { error } = await supabase.from("transaktionen").update({ matching_status: "ignoriert" }).eq("id", txId);
    if (error) {
      setSyncHint(isGerman ? "Backend nicht erreichbar - lokal ignoriert." : "Backend not reachable - ignored locally.");
    } else {
      setSyncHint(isGerman ? "Transaktion als ignoriert markiert." : "Transaction marked as ignored.");
    }
    setClientTx((prev) => prev.map((tx) => (tx.id === txId ? { ...tx, matching_status: "ignoriert" } : tx)));
    refetch();
  }

  function openStatusHelp(id: string, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const width = 340;
    const margin = 12;
    const left = Math.min(rect.left, window.innerWidth - width - margin);
    setStatusHelpPos({ left: Math.max(margin, left), top: rect.bottom + 8 });
    setStatusHelpFor(id);
  }

  async function handleBankSync() {
    setSyncing(true);
    setSyncHint("");
    try {
      const res = await fetch("/api/finapi/transactions", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setSyncHint(isGerman ? "Bank-Sync fehlgeschlagen." : "Bank sync failed.");
      } else {
        const imported = payload.bankSync?.newTransactions ?? 0;
        const auto = payload.matching?.auto ?? 0;
        setSyncHint(
          isGerman
            ? `${imported} neue Buchungen importiert, ${auto} automatisch zugeordnet.`
            : `${imported} new transactions imported, ${auto} auto-assigned.`
        );
      }
      refetch();
    } catch {
      setSyncHint(isGerman ? "Bank-Sync fehlgeschlagen." : "Bank sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  const filters = [
    { key: "alle", label: isGerman ? "Alle" : "All" },
    { key: "auto", label: isGerman ? "Automatisch" : "Automatic" },
    { key: "abweichung", label: isGerman ? "Abweichung" : "Deviation" },
    { key: "unklar", label: isGerman ? "Unklar" : "Unclear" },
  ];
  const visibleTransactions = clientTx.filter((tx) => (statusFilter === "alle" ? true : tx.matching_status === statusFilter));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[30px] font-extrabold tracking-tight text-praxis-800">{isGerman ? "Zahlungen" : "Payments"}</h1>
          <p className="text-sm text-praxis-400 mt-1">
            {visibleTransactions.length} {isGerman ? "Transaktionen" : "transactions"} · {metrics.unclear} {isGerman ? "offen" : "open"}
          </p>
        </div>
        <button className="btn-primary" disabled={syncing} onClick={handleBankSync}>
          {syncing ? (isGerman ? "Synchronisiere..." : "Syncing...") : isGerman ? "Bank-Sync starten" : "Start bank sync"}
        </button>
      </div>

      {syncHint && <div className="rounded-lg border border-surface-200 bg-white px-4 py-3 text-sm text-praxis-600">{syncHint}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={isGerman ? "Eingänge heute" : "Incoming today"} value={`${metrics.incomingToday.toLocaleString("de-DE")}€`} green />
        <MetricCard label={isGerman ? "Auto-zugeordnet" : "Auto-assigned"} value={String(metrics.auto)} sub={`${metrics.autoRate}% ${isGerman ? "Trefferquote" : "match rate"}`} />
        <MetricCard label={isGerman ? "Manuell prüfen" : "Needs review"} value={String(metrics.unclear)} amber />
        <MetricCard label={isGerman ? "Transaktionen gesamt" : "Total transactions"} value={String(metrics.total)} sub={isGerman ? "Letzte 5 Tage" : "Last 5 days"} />
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`ac-chip ${statusFilter === f.key ? "ac-chip-active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-surface-200 bg-white px-4 py-3 text-sm text-praxis-600">
        <p className="font-semibold text-praxis-700 mb-1">{isGerman ? "Status erklärt" : "Status explained"}</p>
        <p>
          <span className="font-semibold">{isGerman ? "auto" : "auto"}:</span> {isGerman ? "System hat Zahlung eindeutig zugeordnet." : "System matched transaction with high confidence."}
          {" · "}
          <span className="font-semibold">{isGerman ? "abweichung" : "deviation"}:</span> {isGerman ? "Patient passt, Betrag/Zweck weicht ab." : "Patient likely matches, amount/purpose deviates."}
          {" · "}
          <span className="font-semibold">{isGerman ? "unklar" : "unclear"}:</span> {isGerman ? "Keine sichere Zuordnung möglich." : "No safe assignment possible."}
        </p>
      </div>

      <div className="bg-white rounded-card shadow-card border border-surface-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-50">
              <th className="table-header">Datum</th>
              <th className="table-header">{isGerman ? "Absender" : "Sender"}</th>
              <th className="table-header text-right">{isGerman ? "Betrag" : "Amount"}</th>
              <th className="table-header">{isGerman ? "Verwendungszweck" : "Purpose"}</th>
              <th className="table-header">Status</th>
              <th className="table-header">{isGerman ? "Zuordnung" : "Assignment"}</th>
              <th className="table-header">{isGerman ? "Aktionen" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {visibleTransactions.map((tx) => (
              <tr
                key={tx.id}
                className={`hover:bg-surface-50/50 transition-colors ${tx.matched_patient_id ? "cursor-pointer" : ""}`}
                onClick={() => tx.matched_patient_id && router.push(`/patienten/${tx.matched_patient_id}`)}
              >
                <td className="table-cell text-sm text-praxis-700">{new Date(tx.datum).toLocaleDateString("de-DE")}</td>
                <td className="table-cell text-sm font-semibold text-praxis-800">{tx.absender_name}</td>
                <td className="table-cell text-right text-sm font-semibold text-[#4ca43f]">+{Number(tx.betrag || 0).toLocaleString("de-DE")}€</td>
                <td className="table-cell text-sm text-praxis-600">{tx.verwendungszweck || "—"}</td>
                <td className="table-cell">
                  <button
                    type="button"
                    className="cursor-help"
                    onMouseEnter={(e) => openStatusHelp(tx.id, e.currentTarget)}
                    onFocus={(e) => openStatusHelp(tx.id, e.currentTarget)}
                    onMouseLeave={() => setStatusHelpFor((curr) => (curr === tx.id ? null : curr))}
                    onBlur={() => setStatusHelpFor((curr) => (curr === tx.id ? null : curr))}
                  >
                    <StatusBadge status={tx.matching_status} />
                  </button>
                </td>
                <td className="table-cell text-sm text-praxis-600">
                  {tx.patients && tx.matched_patient_id ? (
                    <button
                      type="button"
                      className="font-medium text-[#4b42d6] hover:text-[#392fb8]"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/patienten/${tx.matched_patient_id}`);
                      }}
                    >
                      {tx.patients.nachname}, {tx.patients.vorname}
                    </button>
                  ) : "—"}
                </td>
                <td className="table-cell">
                  <div className="flex items-center gap-1">
                    {(tx.matching_status === "unklar" || tx.matching_status === "abweichung") && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMatchModal(tx);
                            setSyncHint(isGerman ? "Bitte Patient für Zuordnung auswählen." : "Select a patient for assignment.");
                          }}
                          type="button"
                          className="p-1.5 text-accent-blue hover:bg-accent-blue/10 rounded-lg transition-colors"
                          title={isGerman ? "Manuell zuordnen" : "Manual assign"}
                        >
                          <ArrowRight size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleIgnore(tx.id);
                          }}
                          type="button"
                          className="p-1.5 text-praxis-400 hover:bg-surface-100 rounded-lg transition-colors"
                          title={isGerman ? "Ignorieren" : "Ignore"}
                        >
                          <X size={14} />
                        </button>
                        {tx.matching_status === "abweichung" && tx.matched_patient_id && (
                          <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleManualMatch(tx.id, tx.matched_patient_id);
                            }}
                            type="button"
                            className="p-1.5 text-accent-emerald hover:bg-accent-emerald/10 rounded-lg transition-colors"
                            title={isGerman ? "Vorschlag bestätigen" : "Confirm suggestion"}
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {visibleTransactions.length === 0 && (
          <EmptyState
            icon={<CreditCard size={24} />}
            title={isGerman ? "Keine Transaktionen" : "No transactions"}
            description={isGerman ? "Es wurden noch keine Bankbuchungen importiert." : "No bank transactions imported yet."}
          />
        )}
      </div>

      {statusHelpFor && statusHelpPos && (() => {
        const tx = visibleTransactions.find((item) => item.id === statusHelpFor) || clientTx.find((item) => item.id === statusHelpFor);
        if (!tx) return null;
        const score = tx.matching_score ? `${Math.round(Number(tx.matching_score))}%` : "—";
        const statusText: Record<string, string> = {
          auto: isGerman ? "Automatisch zugeordnet (hohe Sicherheit)." : "Auto-assigned (high confidence).",
          abweichung: isGerman ? "Zuordnung wahrscheinlich, aber Abweichung bei Betrag oder Verwendungszweck." : "Likely match but amount/purpose deviation.",
          unklar: isGerman ? "Keine sichere Zuordnung gefunden, bitte manuell prüfen." : "No safe match found, requires manual review.",
          manuell: isGerman ? "Durch Team manuell bestätigt." : "Manually assigned by team.",
          ignoriert: isGerman ? "Bewusst nicht zugeordnet." : "Deliberately ignored.",
        };
        return (
          <div
            className="fixed z-[100] w-[340px] rounded-lg border border-surface-200 bg-white p-3 text-sm text-praxis-600 shadow-elevated"
            style={{ left: statusHelpPos.left, top: statusHelpPos.top }}
            onMouseEnter={() => setStatusHelpFor(tx.id)}
            onMouseLeave={() => setStatusHelpFor((curr) => (curr === tx.id ? null : curr))}
          >
            <p className="font-semibold text-praxis-800 mb-1">{isGerman ? "Matching-Status" : "Matching status"}</p>
            <p>{statusText[tx.matching_status] || tx.matching_status}</p>
            <p className="mt-2 text-xs text-praxis-500">
              {isGerman ? "Match-Score" : "Match score"}: {score}
            </p>
            <p className="mt-1 text-xs text-praxis-500">
              {isGerman ? "Aktionen: → manuell zuordnen, × ignorieren, ✓ Vorschlag bestätigen" : "Actions: → assign manually, × ignore, ✓ confirm suggestion"}
            </p>
          </div>
        );
      })()}

      <Modal open={!!matchModal} onClose={() => setMatchModal(null)} title={isGerman ? "Transaktion manuell zuordnen" : "Assign transaction manually"} size="lg">
        {matchModal && (
          <div className="space-y-4">
            <div className="rounded-lg border border-accent-blue/25 bg-accent-blue/5 px-3 py-2 text-sm text-praxis-700">
              {isGerman
                ? "Wähle den passenden Patienten aus der Liste. Danach wird die Transaktion direkt übernommen."
                : "Choose the matching patient from the list. The transaction will be assigned immediately."}
            </div>
            <div className="bg-surface-50 rounded-lg p-4">
              <p className="text-sm font-medium text-praxis-700">{matchModal.absender_name}</p>
              <p className="text-xs text-praxis-400">{matchModal.verwendungszweck}</p>
              <p className="text-lg font-bold text-praxis-800 mt-1">{matchModal.betrag?.toLocaleString("de-DE")} €</p>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400" />
              <input
                type="text"
                placeholder={isGerman ? "Patient suchen..." : "Search patient..."}
                className="input pl-9"
                value={patSearch}
                onChange={(e) => setPatSearch(e.target.value)}
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1">
              {patienten.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleManualMatch(matchModal.id, p.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-praxis-50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-praxis-100 flex items-center justify-center text-xs font-semibold text-praxis-600">
                    {p.vorname[0]}{p.nachname[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-praxis-700">{p.nachname}, {p.vorname}</p>
                    <p className="text-xs text-praxis-400">{(p.raten || []).filter((r: any) => r.status === "offen").length} {isGerman ? "offene Raten" : "open rates"}</p>
                  </div>
                  <ArrowRight size={14} className="text-praxis-400" />
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  green,
  amber,
}: {
  label: string;
  value: string;
  sub?: string;
  green?: boolean;
  amber?: boolean;
}) {
  return (
    <div className="stat-card">
      <p className="text-sm text-praxis-400 font-medium">{label}</p>
      <p className={`mt-1 text-[34px] leading-none tracking-tight font-extrabold ${green ? "text-[#4ca43f]" : amber ? "text-accent-amber" : "text-praxis-800"}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-praxis-400">{sub}</p> : null}
    </div>
  );
}
