"use client";

import { useState } from "react";
import { useTransaktionen, usePatienten } from "@/hooks/useData";
import { StatusBadge, Dropdown, Modal, EmptyState } from "@/components/ui";
import { MatchingChart } from "@/components/charts";
import { CreditCard, Search, Check, X, ArrowRight } from "lucide-react";
import { createBrowserClient } from "@/lib/db/supabase";

export default function ZahlungenPage() {
  const [statusFilter, setStatusFilter] = useState("alle");
  const { transaktionen, loading, refetch } = useTransaktionen({ status: statusFilter });
  const [matchModal, setMatchModal] = useState<any>(null);
  const [patSearch, setPatSearch] = useState("");
  const { patienten } = usePatienten(patSearch);

  // Matching-Statistik
  const matchStats = [
    { status: "Auto-Match", count: transaktionen.filter((t) => t.matching_status === "auto").length, color: "#2dd4a8" },
    { status: "Abweichung", count: transaktionen.filter((t) => t.matching_status === "abweichung").length, color: "#f59e0b" },
    { status: "Unklar", count: transaktionen.filter((t) => t.matching_status === "unklar").length, color: "#f97066" },
    { status: "Manuell", count: transaktionen.filter((t) => t.matching_status === "manuell").length, color: "#3b82f6" },
  ];

  async function handleManualMatch(txId: string, patientId: string) {
    const supabase = createBrowserClient();
    await supabase.from("transaktionen").update({
      matching_status: "manuell",
      matched_patient_id: patientId,
      matching_score: 100,
    }).eq("id", txId);
    setMatchModal(null);
    refetch();
  }

  async function handleIgnore(txId: string) {
    const supabase = createBrowserClient();
    await supabase.from("transaktionen").update({
      matching_status: "ignoriert",
    }).eq("id", txId);
    refetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-praxis-800">Zahlungseingänge</h1>
          <p className="text-sm text-praxis-400 mt-1">
            {transaktionen.length} Transaktionen · {transaktionen.filter((t) => t.matching_status === "unklar").length} offen
          </p>
        </div>
        <button className="btn-primary" onClick={() => {
          fetch("/api/finapi/transactions", { method: "POST" }).then(() => refetch());
        }}>
          Bank-Sync starten
        </button>
      </div>

      {/* Matching-Übersicht */}
      <div className="stat-card">
        <h3 className="text-sm font-semibold text-praxis-700 mb-4">Matching-Qualität</h3>
        <MatchingChart data={matchStats} />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Dropdown
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "alle", label: "Alle" },
            { value: "auto", label: "Auto-Match" },
            { value: "abweichung", label: "Abweichung" },
            { value: "unklar", label: "Unklar" },
            { value: "manuell", label: "Manuell" },
            { value: "ignoriert", label: "Ignoriert" },
          ]}
        />
      </div>

      {/* Transaktionsliste */}
      <div className="bg-white rounded-card shadow-card border border-surface-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-50">
              <th className="table-header">Datum</th>
              <th className="table-header">Absender</th>
              <th className="table-header">Verwendungszweck</th>
              <th className="table-header text-right">Betrag</th>
              <th className="table-header">Zuordnung</th>
              <th className="table-header text-center">Score</th>
              <th className="table-header">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {transaktionen.map((tx) => (
              <tr key={tx.id} className="hover:bg-surface-50/50 transition-colors">
                <td className="table-cell text-sm font-mono text-praxis-600">
                  {new Date(tx.datum).toLocaleDateString("de-DE")}
                </td>
                <td className="table-cell">
                  <p className="text-sm font-medium text-praxis-700">{tx.absender_name}</p>
                  {tx.absender_iban && (
                    <p className="text-xs text-praxis-400 font-mono">{tx.absender_iban}</p>
                  )}
                </td>
                <td className="table-cell text-sm text-praxis-600 max-w-[200px] truncate">
                  {tx.verwendungszweck}
                </td>
                <td className="table-cell text-sm font-semibold text-praxis-800 text-right">
                  {tx.betrag?.toLocaleString("de-DE")} €
                </td>
                <td className="table-cell">
                  {tx.patients ? (
                    <span className="text-sm text-praxis-600">
                      {tx.patients.nachname}, {tx.patients.vorname}
                    </span>
                  ) : (
                    <span className="text-sm text-praxis-400 italic">Nicht zugeordnet</span>
                  )}
                </td>
                <td className="table-cell text-center">
                  {tx.matching_score !== null && (
                    <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                      tx.matching_score >= 90 ? "bg-accent-emerald/15 text-accent-emerald" :
                      tx.matching_score >= 70 ? "bg-accent-amber/15 text-accent-amber" :
                      "bg-accent-coral/15 text-accent-coral"
                    }`}>
                      {tx.matching_score}%
                    </span>
                  )}
                </td>
                <td className="table-cell">
                  <div className="flex items-center gap-1">
                    {tx.matching_status === "unklar" || tx.matching_status === "abweichung" ? (
                      <>
                        <button
                          onClick={() => setMatchModal(tx)}
                          className="p-1.5 text-accent-blue hover:bg-accent-blue/10 rounded-lg transition-colors"
                          title="Manuell zuordnen"
                        >
                          <ArrowRight size={14} />
                        </button>
                        <button
                          onClick={() => handleIgnore(tx.id)}
                          className="p-1.5 text-praxis-400 hover:bg-surface-100 rounded-lg transition-colors"
                          title="Ignorieren"
                        >
                          <X size={14} />
                        </button>
                        {tx.matching_status === "abweichung" && tx.matched_patient_id && (
                          <button
                            onClick={() => handleManualMatch(tx.id, tx.matched_patient_id)}
                            className="p-1.5 text-accent-emerald hover:bg-accent-emerald/10 rounded-lg transition-colors"
                            title="Vorschlag bestätigen"
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </>
                    ) : (
                      <StatusBadge status={tx.matching_status} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {transaktionen.length === 0 && (
          <EmptyState
            icon={<CreditCard size={24} />}
            title="Keine Transaktionen"
            description="Es wurden noch keine Bankbuchungen importiert."
          />
        )}
      </div>

      {/* Manual Match Modal */}
      <Modal
        open={!!matchModal}
        onClose={() => setMatchModal(null)}
        title="Transaktion manuell zuordnen"
        size="lg"
      >
        {matchModal && (
          <div className="space-y-4">
            <div className="bg-surface-50 rounded-lg p-4">
              <p className="text-sm font-medium text-praxis-700">{matchModal.absender_name}</p>
              <p className="text-xs text-praxis-400">{matchModal.verwendungszweck}</p>
              <p className="text-lg font-bold text-praxis-800 mt-1">
                {matchModal.betrag?.toLocaleString("de-DE")} €
              </p>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-praxis-400" />
              <input
                type="text"
                placeholder="Patient suchen..."
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
                    <p className="text-xs text-praxis-400">
                      {(p.raten || []).filter((r: any) => r.status === "offen").length} offene Raten
                    </p>
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
