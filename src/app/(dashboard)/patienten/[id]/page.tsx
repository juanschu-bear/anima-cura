"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { usePatient } from "@/hooks/useData";
import { Skeleton, StatusBadge } from "@/components/ui";
import { useAppStore } from "@/hooks/useAppStore";
import { t } from "@/lib/i18n";
import PatientPortalAdmin from "@/components/patient/PatientPortalAdmin";

export default function PatientDetailPage() {
  const params = useParams();
  const { theme, locale } = useAppStore();
  const { patient, loading } = usePatient(params.id as string);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (!patient) return <p className="text-praxis-400">{t("patients.notFound", locale)}</p>;

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
      label: t("detail.mahnStage1", locale),
      border: "#d8a33a",
      glow: theme === "dark" ? "0 0 0 1px rgba(216, 163, 58, 0.6), 0 0 24px rgba(216, 163, 58, 0.2)" : "0 0 0 1px rgba(216, 163, 58, 0.42), 0 0 16px rgba(216, 163, 58, 0.12)",
      badgeBg: theme === "dark" ? "rgba(216, 163, 58, 0.18)" : "#fdf4df",
      badgeText: "#b57f1f",
    },
    verzug: {
      label: t("detail.mahnStage2", locale),
      border: "#c16f2a",
      glow: theme === "dark" ? "0 0 0 1px rgba(193, 111, 42, 0.64), 0 0 24px rgba(193, 111, 42, 0.24)" : "0 0 0 1px rgba(193, 111, 42, 0.4), 0 0 16px rgba(193, 111, 42, 0.12)",
      badgeBg: theme === "dark" ? "rgba(193, 111, 42, 0.18)" : "#fdeedc",
      badgeText: "#b6662a",
    },
    eskalation: {
      label: t("detail.mahnEsc", locale),
      border: "#cb4f56",
      glow: theme === "dark" ? "0 0 0 1px rgba(203, 79, 86, 0.68), 0 0 28px rgba(203, 79, 86, 0.28)" : "0 0 0 1px rgba(203, 79, 86, 0.44), 0 0 18px rgba(203, 79, 86, 0.14)",
      badgeBg: theme === "dark" ? "rgba(203, 79, 86, 0.2)" : "#fde9ed",
      badgeText: "#bc4558",
    },
    abweichung: {
      label: t("detail.mahnDeviation", locale),
      border: "#c8942d",
      glow: theme === "dark" ? "0 0 0 1px rgba(200, 148, 45, 0.62), 0 0 22px rgba(200, 148, 45, 0.22)" : "0 0 0 1px rgba(200, 148, 45, 0.38), 0 0 14px rgba(200, 148, 45, 0.12)",
      badgeBg: theme === "dark" ? "rgba(200, 148, 45, 0.2)" : "#fdf4df",
      badgeText: "#a87316",
    },
  };

  const mahnHighlight = mahnStageMeta[status];

  const history = raten
    .sort((a: any, b: any) => {
      const da = new Date(a.faellig_am).getTime();
      const db = new Date(b.faellig_am).getTime();
      return db - da;
    });

  return (
    <div className="space-y-6">
      <Link href="/patienten" className="inline-flex items-center gap-2 text-sm font-semibold text-[#5d4fd8] hover:text-[#4c40be]">
        <ArrowLeft size={15} />
        {t("patients.backToList", locale)}
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
          <Info label={t("detail.ivorisNr", locale)} value={patient.ivoris_nummer || "—"} />
          <Info label={t("detail.birthdate", locale)} value={formatDate(patient.geburtsdatum, locale)} />
          <Info label={t("detail.gender", locale)} value={patient.geschlecht === "w" ? t("detail.female", locale) : patient.geschlecht === "m" ? t("detail.male", locale) : patient.geschlecht === "d" ? t("detail.diverse", locale) : "—"} />
          <Info label={t("detail.treatment", locale)} value={patient.behandlung || t("detail.noStatus", locale)} />
          <Info label={t("detail.insurance", locale)} value={
            patient.versicherung_status === "Family" ? t("insurance.familyGKV", locale) :
            patient.versicherung_status === "Statutory" ? t("insurance.statutoryGKV", locale) :
            patient.versicherung_status === "Private" ? t("insurance.privatePKV", locale) :
            patient.versicherung_status === "Retired" ? t("insurance.retiredGKV", locale) :
            patient.kasse === "gesetzlich" ? t("insurance.statutory", locale) : t("insurance.private", locale)
          } />
          <Info label={t("detail.insuranceNr", locale)} value={patient.versichertennummer || "—"} mono />
          {patient.versicherter_vorname && patient.versicherter_nachname &&
            (patient.versicherter_vorname !== patient.vorname || patient.versicherter_nachname !== patient.nachname) ? (
            <Info label={t("detail.insuredPerson", locale)} value={`${patient.versicherter_vorname} ${patient.versicherter_nachname}`} />
          ) : null}
          <Info label={t("detail.patientSince", locale)} value={formatDate(patient.versicherung_seit, locale)} />
          <Info label={t("detail.phone", locale)} value={patient.telefon || "—"} />
          <Info label={t("detail.mobile", locale)} value={patient.mobiltelefon || "—"} />
          <Info label={t("detail.email", locale)} value={patient.email || "—"} />
          <Info label={t("detail.address", locale)} value={
            [patient.strasse, [patient.plz, patient.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"
          } />
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
            <span className="font-bold" style={{ color: "var(--ac-text)" }}>{t("detail.mahnNoteBold", locale)}</span>{" "}
            {t("detail.mahnNote", locale)}{" "}
            <Link href={`/mahnwesen?patient=${patient.id}`} className="font-bold text-[#5d4fd8] hover:text-[#4c40be]">
              {t("detail.dunningLink", locale)}
            </Link>
            .
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label={t("detail.monthlyRate", locale)} value={`${monatlicheRate.toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€`} />
        <MetricCard label={t("detail.progressLabel", locale)} value={`${bezahlt} / ${totalRaten}`} sub={`${progressPct}% ${t("detail.completed", locale)}`} />
        <MetricCard label={t("detail.remainingDebt", locale)} value={`${restschuld.toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€`} accent />
      </div>

      <div className="stat-card">
        <h3 className="mb-4 text-[24px] font-extrabold tracking-tight text-praxis-700">{t("detail.ratePlan", locale)}</h3>
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
          <Legend color="bg-[#4ca43f]" label={t("detail.paid", locale)} />
          <Legend color="bg-accent-coral" label={t("detail.overdue", locale)} />
          <Legend color="bg-white border border-surface-200" label={t("detail.pending", locale)} />
        </div>
      </div>

      <div className="stat-card">
        <h3 className="mb-4 text-[24px] font-extrabold tracking-tight text-praxis-700">{t("detail.paymentHistory", locale)}</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-50">
                <th className="table-header">{locale === "en" ? "Due date" : "Fällig am"}</th>
                <th className="table-header text-right">{t("detail.amount", locale)}</th>
                <th className="table-header">{t("detail.statusHeader", locale)}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h: any) => (
                <tr key={h.id} className="hover:bg-surface-50/70">
                  <td className="table-cell text-base text-praxis-700">
                    <div>{formatDate(h.faellig_am, locale)}</div>
                    {h.status === "bezahlt" && h.bezahlt_am && h.bezahlt_am !== h.faellig_am && (
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{locale === "en" ? "Paid" : "Bezahlt"}: {formatDate(h.bezahlt_am, locale)}</div>
                    )}
                  </td>
                  <td className="table-cell text-right">
                    <div style={{ fontSize: 24, fontWeight: 800, color: h.status === "überfällig" ? "#ef4444" : h.status === "offen" ? "#888" : "#4ca43f" }}>
                      {h.status === "bezahlt" ? (h.bezahlt_betrag || h.betrag || 0).toLocaleString(locale === "en" ? "en-GB" : "de-DE") : (h.betrag || 0).toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€
                    </div>
                    {h.status === "bezahlt" && h.bezahlt_betrag && h.betrag && Number(h.bezahlt_betrag) < Number(h.betrag) && (
                      <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 2 }}>{locale === "en" ? "of" : "von"} {Number(h.betrag).toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€ — {locale === "en" ? "remaining" : "Rest"}: {(Number(h.betrag) - Number(h.bezahlt_betrag)).toLocaleString(locale === "en" ? "en-GB" : "de-DE")}€</div>
                    )}
                  </td>
                  <td className="table-cell">
                    {(() => {
                      const isPaid = h.status === "bezahlt";
                      const isOverdue = h.status === "überfällig";
                      const isOpen = h.status === "offen";
                      const daysLate = isPaid && h.bezahlt_am && h.faellig_am
                        ? Math.floor((new Date(h.bezahlt_am).getTime() - new Date(h.faellig_am).getTime()) / 864e5)
                        : 0;
                      const daysOverdue = isOverdue && h.faellig_am
                        ? Math.floor((Date.now() - new Date(h.faellig_am).getTime()) / 864e5)
                        : 0;

                      if (isPaid && daysLate <= 0) return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, color: "#4ade80" }}>✓ {locale === "en" ? "On time" : "Pünktlich"}</span>;
                      if (isPaid && daysLate > 0) return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, color: "#fbbf24" }}>✓ +{daysLate} {locale === "en" ? "days late" : "Tage verspätet"}</span>;
                      if (isOverdue) return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, color: "#ef4444" }}>! {daysOverdue} {locale === "en" ? "days overdue" : "Tage überfällig"}</span>;
                      if (isOpen) return <span style={{ fontSize: 13, fontWeight: 600, color: "#666" }}>{locale === "en" ? "Pending" : "Ausstehend"}</span>;
                      return <StatusBadge status="auto" />;
                    })()}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td className="table-cell text-sm text-praxis-400" colSpan={3}>
                    {t("detail.noPayments", locale)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PatientPortalAdmin
        patientId={patient.id}
        patientName={`${patient.vorname} ${patient.nachname}`}
      />

      <PatientMessages patientId={patient.id} dark={theme === "dark"} />
    </div>
  );
}

function PatientMessages({ patientId, dark }: { patientId: string; dark: boolean }) {
  const [messages, setMessages] = useState<{ id: string; sender: string; text: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/praxis/messages?patient_id=${patientId}`)
      .then(r => r.json())
      .then(j => { setMessages(j.messages || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [patientId]);

  const muted = dark ? "#777" : "#999";
  const txtH = dark ? "#f0f0f0" : "#1c3044";
  const border = dark ? "rgba(255,255,255,0.06)" : "#e5e8ef";
  const grn = "#4ade80";

  return (
    <div className={`rounded-[16px] border mt-6 ${dark ? "border-white/6 bg-[rgba(16,18,28,0.75)]" : "border-surface-200 bg-white"}`} style={{ overflow: "hidden" }}>
      <button onClick={() => setExpanded(!expanded)} className="w-full" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", cursor: "pointer", background: "transparent", border: "none", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MessageSquare size={18} color={grn} />
          <span style={{ fontSize: 15, fontWeight: 700, color: txtH }}>Chat-Nachrichten</span>
          {messages.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: dark ? "rgba(74,222,128,0.1)" : "rgba(34,197,94,0.06)", color: grn }}>{messages.length}</span>}
        </div>
        <span style={{ color: muted, fontSize: 14 }}>{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div style={{ padding: "0 20px 16px", maxHeight: 400, overflowY: "auto" }}>
          {loading ? (
            <p style={{ color: muted, fontSize: 13, padding: "12px 0" }}>Laden...</p>
          ) : messages.length === 0 ? (
            <p style={{ color: muted, fontSize: 13, padding: "12px 0" }}>Keine Nachrichten vorhanden</p>
          ) : messages.map((m, i) => {
            const isPatient = m.sender === "patient";
            const isIcura = m.sender === "icura";
            return (
              <div key={m.id} style={{ padding: "10px 0", borderTop: i > 0 ? `1px solid ${border}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isPatient ? "#60a5fa" : isIcura ? grn : "#a78bfa" }}>
                    {isPatient ? "Patient" : isIcura ? "iCura" : "Praxis"}
                  </span>
                  <span style={{ fontSize: 10, color: muted }}>{new Date(m.created_at).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: txtH, margin: 0 }}>{m.text}</p>
              </div>
            );
          })}
        </div>
      )}
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

function formatDate(input?: string | null, locale: string = "de") {
  if (!input) return "—";
  const time = new Date(input).getTime();
  if (Number.isNaN(time)) return "—";
  return new Date(input).toLocaleDateString(locale === "en" ? "en-GB" : "de-DE");
}
