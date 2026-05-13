"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { usePatient } from "@/hooks/useData";
import { StatusBadge, Skeleton } from "@/components/ui";
import { ArrowLeft } from "lucide-react";

export default function PatientDetailPage() {
  const params = useParams();
  const { patient, loading } = usePatient(params.id as string);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (!patient) return <p className="text-praxis-400">Patient nicht gefunden.</p>;

  const raten = (patient.raten || []).sort((a: any, b: any) => a.rate_nummer - b.rate_nummer);
  const totalRaten = Math.max(raten.length, 1);
  const bezahlt = raten.filter((r: any) => r.status === "bezahlt").length;
  const offen = raten.filter((r: any) => r.status !== "bezahlt");
  const restschuld = offen.reduce((s: number, r: any) => s + (r.betrag || 0), 0);
  const monatlicheRate = raten[0]?.betrag || 0;
  const progressPct = Math.round((bezahlt / totalRaten) * 100);

  let status = "pünktlich";
  const maxMahn = raten.reduce((m: number, r: any) => Math.max(m, r.mahnstufe || 0), 0);
  const hasOverdue = raten.some((r: any) => r.status === "überfällig");
  if (maxMahn >= 3) status = "eskalation";
  else if (maxMahn === 2) status = "verzug";
  else if (maxMahn === 1) status = "stufe1";
  else if (hasOverdue) status = "abweichung";

  const history = raten
    .filter((r: any) => r.status === "bezahlt" || r.bezahlt_betrag)
    .sort((a: any, b: any) => {
      const da = new Date(a.bezahlt_am || a.faellig_am).getTime();
      const db = new Date(b.bezahlt_am || b.faellig_am).getTime();
      return db - da;
    });

  return (
    <div className="space-y-6">
      <Link href="/patienten" className="inline-flex items-center gap-2 text-sm font-medium text-praxis-500 hover:text-praxis-700">
        <ArrowLeft size={15} />
        Zurück zur Liste
      </Link>

      <div className="stat-card">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-praxis-100 text-xl font-bold text-praxis-600">
            {patient.vorname?.[0]}{patient.nachname?.[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-praxis-800">{patient.nachname}, {patient.vorname}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-praxis-500">
              <span>{patient.behandlung}</span>
              <StatusBadge status={status} />
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <Info label="Geburtsdatum" value={formatDate(patient.geburtsdatum)} />
          <Info label="Kassenart" value={patient.kasse === "privat" ? "Privat" : "Gesetzlich"} />
          <Info label="Behandlungsbeginn" value={formatDate(patient.behandlung_start)} />
          <Info label="Telefon" value={patient.telefon || "—"} />
          <Info label="E-Mail" value={patient.email || "—"} />
          <Info label="IBAN" value={patient.iban || "—"} mono />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Monatliche Rate" value={`${monatlicheRate.toLocaleString("de-DE")}€`} />
        <MetricCard label="Fortschritt" value={`${bezahlt} / ${totalRaten} Raten`} sub={`${progressPct}% abgeschlossen`} />
        <MetricCard label="Restschuld" value={`${restschuld.toLocaleString("de-DE")}€`} accent />
      </div>

      <div className="stat-card">
        <h3 className="text-xl font-semibold text-praxis-700 mb-4">Ratenplan</h3>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: totalRaten }).map((_, idx) => {
            const rate = raten[idx];
            const isPaid = rate?.status === "bezahlt";
            const isLate = rate?.status === "überfällig";
            return (
              <span
                key={`rp-${idx}`}
                className={`h-4 w-4 rounded-[5px] border ${
                  isPaid
                    ? "bg-[#4ca43f] border-[#4ca43f]"
                    : isLate
                    ? "bg-accent-coral border-accent-coral"
                    : "bg-transparent border-surface-200"
                }`}
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-5 text-sm text-praxis-500">
          <Legend color="bg-[#4ca43f]" label="Bezahlt" />
          <Legend color="bg-accent-coral" label="Überfällig" />
          <Legend color="bg-transparent border border-surface-200" label="Ausstehend" />
        </div>
      </div>

      <div className="stat-card">
        <h3 className="text-xl font-semibold text-praxis-700 mb-4">Zahlungshistorie</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-50">
                <th className="table-header">Datum</th>
                <th className="table-header text-right">Betrag</th>
                <th className="table-header">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h: any) => (
                <tr key={h.id} className="hover:bg-surface-50/50">
                  <td className="table-cell text-sm text-praxis-700">{formatDate(h.bezahlt_am || h.faellig_am)}</td>
                  <td className="table-cell text-right text-lg font-semibold text-[#4ca43f]">
                    {(h.bezahlt_betrag || h.betrag || 0).toLocaleString("de-DE")}€
                  </td>
                  <td className="table-cell">
                    <StatusBadge status="auto" />
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td className="table-cell text-sm text-praxis-400" colSpan={3}>
                    Noch keine verbuchten Zahlungen vorhanden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-praxis-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold text-praxis-800 ${mono ? "font-mono text-sm" : ""}`}>{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="stat-card">
      <p className="text-sm font-medium text-praxis-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accent ? "text-accent-coral" : "text-praxis-800"}`}>{value}</p>
      {sub ? <p className="mt-1 text-sm text-praxis-400">{sub}</p> : null}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className={`h-3 w-3 rounded-sm ${color}`} />
      <span>{label}</span>
    </div>
  );
}

function formatDate(input?: string | null) {
  if (!input) return "—";
  const time = new Date(input).getTime();
  if (Number.isNaN(time)) return "—";
  return new Date(input).toLocaleDateString("de-DE");
}
