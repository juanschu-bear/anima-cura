"use client";

import { useParams } from "next/navigation";
import { usePatient } from "@/hooks/useData";
import { StatCard, StatusBadge, Badge, Skeleton } from "@/components/ui";
import { User, Euro, CalendarRange, AlertTriangle, Phone, Mail, MapPin } from "lucide-react";

export default function PatientDetailPage() {
  const params = useParams();
  const { patient, loading } = usePatient(params.id as string);

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>;
  if (!patient) return <p className="text-praxis-400">Patient nicht gefunden.</p>;

  const raten = patient.raten || [];
  const offeneRaten = raten.filter((r: any) => r.status === "offen" || r.status === "überfällig");
  const bezahlteRaten = raten.filter((r: any) => r.status === "bezahlt");
  const offenGesamt = offeneRaten.reduce((s: number, r: any) => s + r.betrag, 0);
  const bezahltGesamt = bezahlteRaten.reduce((s: number, r: any) => s + (r.bezahlt_betrag || r.betrag), 0);
  const gesamtBetrag = (patient.ratenplaene || []).reduce((s: number, rp: any) => s + rp.gesamtbetrag, 0);

  return (
    <div className="space-y-6">
      {/* Patient Header */}
      <div className="stat-card">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-praxis-100 flex items-center justify-center text-xl font-bold text-praxis-600">
            {patient.vorname[0]}{patient.nachname[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-praxis-800">
              {patient.nachname}, {patient.vorname}
            </h1>
            <p className="text-sm text-praxis-400 mt-0.5">
              {patient.behandlung} · seit {new Date(patient.behandlung_start).toLocaleDateString("de-DE")}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge status={patient.behandlung_status} />
              <Badge variant={patient.kasse === "privat" ? "info" : "neutral"}>
                {patient.kasse === "privat" ? "Privat" : "Gesetzlich"}
              </Badge>
            </div>
          </div>
          <div className="text-right space-y-1">
            {patient.telefon && (
              <p className="text-sm text-praxis-600 flex items-center gap-2 justify-end">
                <Phone size={14} /> {patient.telefon}
              </p>
            )}
            {patient.email && (
              <p className="text-sm text-praxis-600 flex items-center gap-2 justify-end">
                <Mail size={14} /> {patient.email}
              </p>
            )}
            {patient.ort && (
              <p className="text-xs text-praxis-400 flex items-center gap-2 justify-end">
                <MapPin size={12} /> {patient.plz} {patient.ort}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Gesamtvolumen" value={gesamtBetrag.toLocaleString("de-DE")} suffix="€" icon={<Euro size={20} />} />
        <StatCard label="Bereits bezahlt" value={bezahltGesamt.toLocaleString("de-DE")} suffix="€" variant="success" />
        <StatCard label="Offen" value={offenGesamt.toLocaleString("de-DE")} suffix="€" variant={offenGesamt > 0 ? "warning" : "success"} />
        <StatCard label="Fortschritt" value={gesamtBetrag > 0 ? Math.round((bezahltGesamt / gesamtBetrag) * 100) : 0} suffix="%" />
      </div>

      {/* Raten-Tabelle */}
      <div className="stat-card">
        <h3 className="text-sm font-semibold text-praxis-700 mb-4">Ratenverlauf</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-50">
                <th className="table-header">Nr.</th>
                <th className="table-header">Fällig am</th>
                <th className="table-header text-right">Betrag</th>
                <th className="table-header text-right">Bezahlt</th>
                <th className="table-header">Status</th>
                <th className="table-header">Mahnstufe</th>
                <th className="table-header">Bezahlt am</th>
              </tr>
            </thead>
            <tbody>
              {raten
                .sort((a: any, b: any) => a.rate_nummer - b.rate_nummer)
                .map((rate: any) => (
                <tr key={rate.id} className="hover:bg-surface-50/50">
                  <td className="table-cell text-sm font-mono font-semibold text-praxis-600">
                    {rate.rate_nummer}
                  </td>
                  <td className="table-cell text-sm text-praxis-600">
                    {new Date(rate.faellig_am).toLocaleDateString("de-DE")}
                  </td>
                  <td className="table-cell text-sm text-right font-medium text-praxis-700">
                    {rate.betrag.toLocaleString("de-DE")} €
                  </td>
                  <td className="table-cell text-sm text-right">
                    {rate.bezahlt_betrag ? (
                      <span className={rate.bezahlt_betrag < rate.betrag ? "text-accent-amber" : "text-accent-emerald"}>
                        {rate.bezahlt_betrag.toLocaleString("de-DE")} €
                      </span>
                    ) : (
                      <span className="text-praxis-300">–</span>
                    )}
                  </td>
                  <td className="table-cell">
                    <StatusBadge status={rate.status} />
                  </td>
                  <td className="table-cell">
                    {rate.mahnstufe > 0 ? (
                      <span className="badge badge-danger">Stufe {rate.mahnstufe}</span>
                    ) : (
                      <span className="text-xs text-praxis-300">–</span>
                    )}
                  </td>
                  <td className="table-cell text-sm text-praxis-500">
                    {rate.bezahlt_am ? new Date(rate.bezahlt_am).toLocaleDateString("de-DE") : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mahnhistorie */}
      {(patient.mahnungen || []).length > 0 && (
        <div className="stat-card">
          <h3 className="text-sm font-semibold text-praxis-700 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-accent-amber" />
            Mahnhistorie
          </h3>
          <div className="space-y-3">
            {(patient.mahnungen || []).map((m: any) => (
              <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface-50">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  m.stufe === 1 ? "bg-accent-amber/15 text-accent-amber" :
                  m.stufe === 2 ? "bg-accent-coral/15 text-accent-coral" :
                  "bg-red-100 text-red-700"
                }`}>
                  {m.stufe}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-praxis-700">
                      {m.typ === "email" ? "E-Mail" : m.typ === "brief" ? "Brief" : "Einschreiben"}
                    </span>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="text-xs text-praxis-400 mt-0.5">
                    Geplant: {new Date(m.geplant_am).toLocaleDateString("de-DE")}
                    {m.versendet_am && ` · Versendet: ${new Date(m.versendet_am).toLocaleDateString("de-DE")}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
