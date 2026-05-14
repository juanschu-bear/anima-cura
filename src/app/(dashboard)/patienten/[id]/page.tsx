"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { usePatient } from "@/hooks/useData";
import { Skeleton, StatusBadge } from "@/components/ui";
import { useAppStore } from "@/hooks/useAppStore";

export default function PatientDetailPage() {
  const params = useParams();
  const { theme } = useAppStore();
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
  const restschuld = raten
    .filter((r: any) => r.status !== "bezahlt")
    .reduce((s: number, r: any) => s + (r.betrag || 0), 0);
  const monatlicheRate = raten[0]?.betrag || 0;
  const progressPct = Math.round((bezahlt / totalRaten) * 100);

  let status = "pünktlich";
  const maxMahn = raten.reduce((m: number, r: any) => Math.max(m, r.mahnstufe || 0), 0);
  const hasOverdue = raten.some((r: any) => r.status === "überfällig");
  if (maxMahn >= 3) status = "eskalation";
  else if (maxMahn === 2) status = "verzug";
  else if (maxMahn === 1) status = "stufe1";
  else if (hasOverdue) status = "abweichung";

  const mahnStageMeta: Record<string, { label: string; border: string; glow: string; badgeBg: string; badgeText: string }> = {
    stufe1: {
      label: "Im Mahnsystem: Stufe 1",
      border: "#d8a33a",
      glow: theme === "dark" ? "0 0 0 1px rgba(216, 163, 58, 0.6), 0 0 24px rgba(216, 163, 58, 0.2)" : "0 0 0 1px rgba(216, 163, 58, 0.42), 0 0 16px rgba(216, 163, 58, 0.12)",
      badgeBg: theme === "dark" ? "rgba(216, 163, 58, 0.18)" : "#fdf4df",
      badgeText: "#b57f1f",
    },
    verzug: {
      label: "Im Mahnsystem: Stufe 2 (Verzug)",
      border: "#c16f2a",
      glow: theme === "dark" ? "0 0 0 1px rgba(193, 111, 42, 0.64), 0 0 24px rgba(193, 111, 42, 0.24)" : "0 0 0 1px rgba(193, 111, 42, 0.4), 0 0 16px rgba(193, 111, 42, 0.12)",
      badgeBg: theme === "dark" ? "rgba(193, 111, 42, 0.18)" : "#fdeedc",
      badgeText: "#b6662a",
    },
    eskalation: {
      label: "Im Mahnsystem: Eskalation",
      border: "#cb4f56",
      glow: theme === "dark" ? "0 0 0 1px rgba(203, 79, 86, 0.68), 0 0 28px rgba(203, 79, 86, 0.28)" : "0 0 0 1px rgba(203, 79, 86, 0.44), 0 0 18px rgba(203, 79, 86, 0.14)",
      badgeBg: theme === "dark" ? "rgba(203, 79, 86, 0.2)" : "#fde9ed",
      badgeText: "#bc4558",
    },
    abweichung: {
      label: "Im Mahnsystem: Abweichung erkannt",
      border: "#c8942d",
      glow: theme === "dark" ? "0 0 0 1px rgba(200, 148, 45, 0.62), 0 0 22px rgba(200, 148, 45, 0.22)" : "0 0 0 1px rgba(200, 148, 45, 0.38), 0 0 14px rgba(200, 148, 45, 0.12)",
      badgeBg: theme === "dark" ? "rgba(200, 148, 45, 0.2)" : "#fdf4df",
      badgeText: "#a87316",
    },
  };

  const mahnHighlight = mahnStageMeta[status];

  const history = raten
    .filter((r: any) => r.status === "bezahlt" || r.bezahlt_betrag)
    .sort((a: any, b: any) => {
      const da = new Date(a.bezahlt_am || a.faellig_am).getTime();
      const db = new Date(b.bezahlt_am || b.faellig_am).getTime();
      return db - da;
    });

  return (
    <div className="space-y-6">
      <Link href="/patienten" className="inline-flex items-center gap-2 text-sm font-semibold text-[#5d4fd8] hover:text-[#4c40be]">
        <ArrowLeft size={15} />
        Zurück zur Liste
      </Link>

      <div
        className="stat-card"
        style={
          mahnHighlight
            ? {
                borderColor: mahnHighlight.border,
                boxShadow: mahnHighlight.glow,
              }
            : undefined
        }
      >
        {mahnHighlight && (
          <div
            className="mb-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold tracking-wide"
            style={{ background: mahnHighlight.badgeBg, color: mahnHighlight.badgeText }}
          >
            {mahnHighlight.label}
          </div>
        )}
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#edeaff] text-2xl font-extrabold text-[#5d4fd8]">
            {patient.vorname?.[0]}
            {patient.nachname?.[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-[28px] font-extrabold tracking-tight text-praxis-800">
              {patient.nachname}, {patient.vorname}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-base text-praxis-500">
              <span>{patient.behandlung}</span>
              <StatusBadge status={status} />
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 text-sm md:grid-cols-3">
          <Info label="Geburtsdatum" value={formatDate(patient.geburtsdatum)} />
          <Info label="Kassenart" value={patient.kasse === "privat" ? "Privat" : "Gesetzlich"} />
          <Info label="Behandlungsbeginn" value={formatDate(patient.behandlung_start)} />
          <Info label="Telefon" value={patient.telefon || "—"} />
          <Info label="E-Mail" value={patient.email || "—"} />
          <Info label="IBAN" value={patient.iban || "—"} mono />
        </div>
        {mahnHighlight && (
          <div
            className="mt-5 rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: mahnHighlight.border,
              background: theme === "dark" ? "rgba(255,255,255,0.02)" : "#fff",
              color: "var(--ac-text-soft)",
            }}
          >
            <span className="font-bold" style={{ color: "var(--ac-text)" }}>Mahnstatus aktiv.</span>{" "}
            Dieser Patient befindet sich aktuell im Mahnsystem. Prüfe den Fall im Bereich{" "}
            <Link href={`/mahnwesen?patient=${patient.id}`} className="font-bold text-[#5d4fd8] hover:text-[#4c40be]">
              Mahnwesen
            </Link>
            .
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Monatliche Rate" value={`${monatlicheRate.toLocaleString("de-DE")}€`} />
        <MetricCard label="Fortschritt" value={`${bezahlt} / ${totalRaten} Raten`} sub={`${progressPct}% abgeschlossen`} />
        <MetricCard label="Restschuld" value={`${restschuld.toLocaleString("de-DE")}€`} accent />
      </div>

      <div className="stat-card">
        <h3 className="mb-4 text-[24px] font-extrabold tracking-tight text-praxis-700">Ratenplan</h3>
        <div className="flex max-w-[760px] flex-wrap gap-1.5">
          {Array.from({ length: totalRaten }).map((_, idx) => {
            const rate = raten[idx];
            const isPaid = rate?.status === "bezahlt";
            const isLate = rate?.status === "überfällig";
            return (
              <span
                key={`rp-${idx}`}
                className={`h-5 w-5 rounded-[5px] border ${
                  isPaid
                    ? "border-[#4ca43f] bg-[#4ca43f]"
                    : isLate
                    ? "border-accent-coral bg-accent-coral"
                    : "border-surface-200 bg-white"
                }`}
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-5 text-sm text-praxis-500">
          <Legend color="bg-[#4ca43f]" label="Bezahlt" />
          <Legend color="bg-accent-coral" label="Überfällig" />
          <Legend color="bg-white border border-surface-200" label="Ausstehend" />
        </div>
      </div>

      <div className="stat-card">
        <h3 className="mb-4 text-[24px] font-extrabold tracking-tight text-praxis-700">Zahlungshistorie</h3>
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
                <tr key={h.id} className="hover:bg-surface-50/70">
                  <td className="table-cell text-base text-praxis-700">{formatDate(h.bezahlt_am || h.faellig_am)}</td>
                  <td className="table-cell text-right text-[24px] font-extrabold text-[#4ca43f]">
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
      <p className="text-xs font-semibold uppercase tracking-wide text-praxis-400">{label}</p>
      <p className={`mt-1 text-[18px] font-bold tracking-tight text-praxis-800 ${mono ? "font-mono text-sm" : ""}`}>
        {value}
      </p>
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
      <p className={`mt-1 text-[28px] font-extrabold leading-none tracking-tight ${accent ? "text-accent-coral" : "text-praxis-800"}`}>
        {value}
      </p>
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
