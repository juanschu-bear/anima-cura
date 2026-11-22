"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/hooks/useAppStore";

/**
 * Bereich „Rechnungen“ im Patientenprofil der Praxis, 3 Ebenen derselben Akte
 * (Vertrag anima-leitstand/docs/2026-11-22-invoice-record-contract.md, Juans Entscheidung 22.11.2026):
 *  1. Kontoauszug: alle Quartale, Zahlung als Balken, Zustellung als Linie, Saldo mit Guthaben.
 *  2. Akte: ein Quartal mit 4 Stationen, Positionen, Begründungen, Zahlungs- und Zustellverlauf.
 *  3. Dokument: das gestaltete Blatt mit allen Positionen, wie es der Patient bekommt, dazu das PDF.
 * Liest nur GET /api/rechnungsakte?patientId=…; dieselbe Akte sieht der Patient in seiner App. Nichts wird verändert.
 */
type Position = { date?: string | null; code?: string | null; text?: string | null; cents?: number | null; factor?: number | null; quantity?: number | null; tariff?: string | null; region?: string | null; reasonRefs?: string[] | null };
type Reason = { key?: string | null; text?: string | null };
type Delivery = { kind: string; at: string | null; document_id?: string; version: "current" | "history" };
type History = { documentId: string; kind: string; createdAt: string | null; amountCents: number | null; amountDeltaCents: number | null; comparison: "equal" | "different" | "unknown" };
type Allocation = { amountCents?: number | null; bookedAt?: string | null; booked_at?: string | null; state?: string | null };
type Payment = { status: string | null; amountCents: number | null; openCents: number | null; paidCents: number | null; openItemId: string; allocations?: Allocation[] } | null;
export type InvoiceRecord = {
  id: string; key: string; patientId: string | null; quarter: string | null; art: string | null; invoiceNumber: string | null; date: string | null;
  amountCents: number | null; positions: Position[]; reasons: Reason[]; patientVisible: boolean; reviewReason: string | null;
  payment: Payment; paymentReviewReason: string | null; delivery: Delivery[]; history: History[];
};
type Orphan = { id: string; quarter?: string; art?: string; amountCents?: number; hochgeladen_am?: string | null; reason: string };
type Answer = { records: InvoiceRecord[]; unmatchedHistory: Orphan[]; discrepancies: unknown[]; asOf?: string };

const eur = (c: number | null | undefined) => c === null || c === undefined ? null : (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const num = (v: number | null | undefined) => v === null || v === undefined ? "" : v.toLocaleString("de-DE", { maximumFractionDigits: 2 });
const day = (v: string | null | undefined) => v ? new Date(v).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
const dayShort = (v: string | null | undefined) => v ? new Date(v).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : null;
const stamp = (v: string | null | undefined) => v ? new Date(v).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
const quarterParts = (q: string | null) => { const m = q?.match(/^(\d{4})-Q([1-4])$/); return m ? { q: m[2], y: m[1] } : null; };
const quarterLabel = (q: string | null, lang: string) => { const p = quarterParts(q); return p ? t("invoiceRecords.quarter", lang, p) : q || ""; };
const addDays = (v: string, n: number) => { const d = new Date(v); d.setDate(d.getDate() + n); return d.toISOString(); };

/** Zahlungsstand aus dem offenen Posten; ohne Verknüpfung wird nichts erfunden. */
function paymentState(r: InvoiceRecord) {
  const p = r.payment, total = r.amountCents ?? p?.amountCents ?? null;
  if (!p) return { key: r.paymentReviewReason === "ambiguous_open_item" ? "ambiguous" : "unlinked", tone: "quiet" as const, paid: null as number | null, open: null as number | null, total };
  const paid = p.status === "bezahlt" || (p.openCents !== null && p.openCents <= 0 && (p.amountCents ?? 0) > 0);
  if (paid) return { key: "paid", tone: "ok" as const, paid: p.paidCents ?? p.amountCents, open: 0, total: p.amountCents ?? total };
  if ((p.paidCents ?? 0) > 0) return { key: "partly", tone: "mid" as const, paid: p.paidCents, open: p.openCents, total: p.amountCents ?? total };
  return { key: "open", tone: "warn" as const, paid: 0, open: p.openCents ?? p.amountCents ?? total, total: p.amountCents ?? total };
}

type StationState = "done" | "now" | "warn" | "todo";
type Station = { label: string; sub: string; state: StationState };

/** Die 4 Stationen einer Rechnung: erstellt, Mail angenommen, geöffnet, bezahlt. */
function stations(r: InvoiceRecord, lang: string): Station[] {
  const cur = r.delivery.filter(e => e.version === "current");
  const first = (...kinds: string[]) => cur.filter(e => kinds.includes(e.kind)).sort((a, b) => (a.at || "").localeCompare(b.at || ""))[0] || null;
  const sent = first("mail_accepted", "mail_delivered"), appOnly = first("push_sent", "app_notice_created");
  const opened = first("invoice_opened", "pdf_retrieved"), bounced = first("mail_bounced", "mail_failed", "mail_complained");
  const pay = paymentState(r);
  const lastContact = [sent, appOnly].filter((e): e is Delivery => !!e).sort((a, b) => (b.at || "").localeCompare(a.at || ""))[0];
  const nextReminder = !opened && lastContact?.at ? addDays(lastContact.at, 3) : null;
  const reminderSub = nextReminder ? (Date.parse(nextReminder) < Date.now() ? t("invoiceRecords.st.reminderNext", lang) : t("invoiceRecords.st.reminder", lang, { date: day(nextReminder) || "" })) : "";
  const s1: Station = { label: t("invoiceRecords.st.created", lang), sub: day(r.date) || "", state: "done" };
  const s2: Station = bounced
    ? { label: t("invoiceRecords.st.bounced", lang), sub: stamp(bounced.at) || "", state: "warn" }
    : sent
    ? { label: t("invoiceRecords.st.sent", lang), sub: stamp(sent.at) || "", state: "done" }
    : appOnly
    ? { label: t("invoiceRecords.st.appOnly", lang), sub: stamp(appOnly.at) || "", state: "done" }
    : { label: t("invoiceRecords.st.notSent", lang), sub: t("invoiceRecords.st.notSentSub", lang), state: "todo" };
  const s3: Station = opened
    ? { label: t("invoiceRecords.st.opened", lang), sub: stamp(opened.at) || "", state: "done" }
    : { label: t("invoiceRecords.st.notOpened", lang), sub: reminderSub, state: sent || appOnly ? "now" : "todo" };
  const s4: Station = pay.key === "paid"
    ? { label: t("invoiceRecords.st.paid", lang), sub: eur(pay.paid) || "", state: "done" }
    : pay.key === "partly"
    ? { label: t("invoiceRecords.st.partly", lang), sub: t("invoiceRecords.stillOpen", lang, { amount: eur(pay.open) || "" }), state: "now" }
    : pay.key === "open"
    ? { label: t("invoiceRecords.st.openPay", lang), sub: eur(pay.open) || "", state: opened ? "now" : "todo" }
    : { label: t("invoiceRecords.st.payUnknown", lang), sub: t(`invoiceRecords.pay.${pay.key}`, lang), state: "todo" };
  return [s1, s2, s3, s4];
}

const chip = { ok: "bg-emerald-500/15 text-emerald-600", mid: "bg-sky-500/15 text-sky-600", warn: "bg-amber-500/20 text-amber-700", quiet: "bg-surface-100 text-praxis-400" };
const stationBox: Record<StationState, string> = { done: "border-emerald-500/40 bg-emerald-500/10", now: "border-sky-500/50 bg-sky-500/10", warn: "border-amber-500/50 bg-amber-500/10", todo: "border-surface-200 bg-transparent" };
const stationText: Record<StationState, string> = { done: "text-emerald-600", now: "text-sky-600", warn: "text-amber-700", todo: "text-praxis-500" };
const dot: Record<StationState, string> = { done: "bg-emerald-400", now: "bg-sky-400 ring-4 ring-sky-400/20", warn: "bg-amber-400", todo: "bg-surface-200" };
const posMeta = (pos: Position) => [[pos.tariff, pos.code].filter(Boolean).join(" "), pos.region, [num(pos.quantity), num(pos.factor)].filter(Boolean).join(" × ")].filter(Boolean).join(" · ");

export default function PatientInvoiceRecords({ patientId, guthaben = null }: { patientId: string; guthaben?: number | null }) {
  const lang = useAppStore(s => s.locale);
  const [data, setData] = useState<Answer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "forbidden">("loading");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const r = await fetch(`/api/rechnungsakte?patientId=${encodeURIComponent(patientId)}`, { cache: "no-store" });
      if (r.status === 403) { setState("forbidden"); return; }
      if (!r.ok) throw new Error("unavailable");
      const j = await r.json();
      if (!Array.isArray(j?.records)) throw new Error("shape");
      setData(j); setState("ready");
    } catch { setState("unavailable"); }
  }, [patientId]);
  useEffect(() => { void load(); }, [load]);

  const records = useMemo(() => [...(data?.records ?? [])].sort((a, b) => (b.quarter || "").localeCompare(a.quarter || "") || (b.date || "").localeCompare(a.date || "")), [data]);
  const orphans = data?.unmatchedHistory ?? [];

  // Saldo nur aus verknüpften Posten. Nicht verknüpfte Rechnungen werden gezählt, nicht geschätzt.
  const saldo = useMemo(() => {
    let open = 0, paid = 0, unlinked = 0;
    for (const r of records) { const p = paymentState(r); if (p.open === null) unlinked += 1; else { open += p.open; paid += p.paid ?? 0; } }
    return { open, paid, unlinked, credit: Math.round(Math.max(0, Number(guthaben ?? 0)) * 100) };
  }, [records, guthaben]);

  return (
    <div className="stat-card mt-4" id="patient-rechnungen">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[20px] font-extrabold tracking-tight text-praxis-700">{t("invoiceRecords.title", lang)}</h3>
        <p className="text-xs text-praxis-400">{t("invoiceRecords.sameAsApp", lang)}</p>
      </div>

      {state === "loading" && <p className="text-sm text-praxis-400" role="status">{t("invoiceRecords.loading", lang)}</p>}
      {state === "forbidden" && <p className="text-sm text-praxis-500">{t("invoiceRecords.forbidden", lang)}</p>}
      {state === "unavailable" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300/60 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-praxis-700">{t("invoiceRecords.unavailable", lang)}</p>
          <button type="button" onClick={() => void load()} className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-semibold text-praxis-500 hover:bg-surface-50">{t("invoiceRecords.retry", lang)}</button>
        </div>
      )}
      {state === "ready" && records.length === 0 && orphans.length === 0 && <p className="text-sm text-praxis-400">{t("invoiceRecords.none", lang)}</p>}

      {state === "ready" && records.length > 0 && (
        <>
          {/* Ebene 1: Saldo */}
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label={t("invoiceRecords.saldo.open", lang)} value={eur(saldo.open) || "0,00 €"} tone={saldo.open > 0 ? "warn" : "ok"} />
            <Stat label={t("invoiceRecords.saldo.paid", lang)} value={eur(saldo.paid) || "0,00 €"} tone="ok" />
            <Stat label={t("invoiceRecords.saldo.credit", lang)} value={eur(saldo.credit) || "0,00 €"} tone={saldo.credit > 0 ? "mid" : "quiet"} hint={saldo.credit > 0 ? t("invoiceRecords.saldo.creditHint", lang) : undefined} />
            <Stat label={t("invoiceRecords.saldo.count", lang)} value={String(records.length)} tone="quiet" hint={saldo.unlinked > 0 ? t("invoiceRecords.saldo.unlinked", lang, { n: saldo.unlinked }) : undefined} />
          </div>

          {/* Ebene 1: Kontoauszug */}
          <div className="space-y-2">
            {records.map(r => {
              const p = paymentState(r), st = stations(r, lang), isOpen = openId === r.id;
              const total = p.total ?? 0, paidPct = total > 0 && p.paid !== null ? Math.min(100, Math.round((p.paid / total) * 100)) : 0;
              return (
                <div key={r.id} className={`rounded-lg border ${isOpen ? "border-[#5d4fd8]/60" : "border-surface-200"}`}>
                  <button type="button" onClick={() => { setOpenId(isOpen ? null : r.id); setShowDoc(false); }} aria-expanded={isOpen} className="w-full px-4 py-3 text-left">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-praxis-700">
                        {quarterLabel(r.quarter, lang)}{r.art ? <span className="font-normal text-praxis-400"> · {r.art}</span> : null}
                        {r.invoiceNumber ? <span className="font-normal text-praxis-400"> · {t("invoiceRecords.number", lang, { n: r.invoiceNumber })}</span> : null}
                        <span className="font-normal text-praxis-400"> · {t("invoiceRecords.positions", lang, { n: r.positions.length })}</span>
                      </p>
                      <p className="text-base font-extrabold text-praxis-700">{eur(r.amountCents) ?? t("invoiceRecords.amountUnknown", lang)}</p>
                    </div>
                    <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-100">
                      {p.open === null ? <i className="block h-full w-full bg-surface-200" /> : <><i className="block h-full bg-emerald-400" style={{ width: `${paidPct}%` }} /><i className="block h-full bg-amber-400" style={{ width: `${100 - paidPct}%` }} /></>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-praxis-400">
                      {p.open === null ? <span>{t(`invoiceRecords.pay.${p.key}`, lang)}</span> : <>
                        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400 align-[1px]" />{t("invoiceRecords.legend.paid", lang, { amount: eur(p.paid) || "0,00 €" })}</span>
                        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400 align-[1px]" />{t("invoiceRecords.legend.open", lang, { amount: eur(p.open) || "0,00 €" })}</span>
                      </>}
                      {!r.patientVisible && <span className={`rounded-full px-2 ${chip.warn}`}>{t("invoiceRecords.notReleased", lang)}</span>}
                      {r.history.some(h => h.comparison === "different") && <span className={`rounded-full px-2 ${chip.warn}`}>{t("invoiceRecords.amountDiffers", lang)}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-y-1 text-[11px] text-praxis-400">
                      {st.map((s, i) => (
                        <span key={i} className="flex items-center">
                          <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${dot[s.state]}`} />
                          <span className={s.state === "todo" ? "" : "text-praxis-500"}>{s.label}{s.sub && s.state !== "todo" ? ` ${s.sub.replace(/, \d\d:\d\d$/, "")}` : ""}</span>
                          {i < st.length - 1 && <span className="mx-2 inline-block h-px w-4 bg-surface-200" />}
                        </span>
                      ))}
                    </div>
                  </button>

                  {/* Ebene 2: Akte */}
                  {isOpen && (
                    <div className="space-y-4 border-t border-surface-200 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-praxis-400">{t("invoiceRecords.invoiceTitle", lang, { quarter: quarterLabel(r.quarter, lang) })}{r.art ? ` · ${r.art}` : ""}{r.invoiceNumber ? ` · ${t("invoiceRecords.number", lang, { n: r.invoiceNumber })}` : ""}{r.date ? ` · ${day(r.date)}` : ""}</p>
                          <p className="text-[30px] font-extrabold leading-none tracking-tight text-praxis-700">{eur(r.amountCents) ?? t("invoiceRecords.amountUnknown", lang)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setShowDoc(v => !v)} className="rounded-lg bg-[#5d4fd8] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#4c40be]">{showDoc ? t("invoiceRecords.hideDoc", lang) : t("invoiceRecords.showDoc", lang)}</button>
                          <a href={`/api/rechnungsakte?documentId=${r.id}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-semibold text-praxis-500 hover:bg-surface-50">{t("invoiceRecords.openPdf", lang)}</a>
                          {r.history.map(h => (
                            <a key={h.documentId} href={`/api/rechnungsakte?historyId=${h.documentId}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-semibold text-praxis-500 hover:bg-surface-50">
                              {t("invoiceRecords.summaryFrom", lang, { date: day(h.createdAt) || "" })}{h.comparison === "different" ? ` · ${eur(h.amountCents)}` : ""}
                            </a>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                        {st.map((s, i) => (
                          <div key={i} className={`rounded-lg border px-3 py-2 ${stationBox[s.state]}`}>
                            <p className={`text-xs font-bold ${stationText[s.state]}`}>{s.label}</p>
                            <p className="text-[11.5px] text-praxis-400">{s.sub}</p>
                          </div>
                        ))}
                      </div>

                      {/* Ebene 3: Dokument */}
                      {showDoc ? <InvoiceSheet r={r} lang={lang} /> : (
                        <>
                          {r.positions.length > 0 ? (
                            <div>
                              {r.positions.map((pos, i) => (
                                <div key={i} className="grid grid-cols-[48px_minmax(0,1fr)_auto] gap-2.5 border-t border-surface-200 py-2 text-xs first:border-t-0">
                                  <span className="text-praxis-400">{dayShort(pos.date) || ""}</span>
                                  <span className="text-praxis-700">{pos.text || ""}{pos.reasonRefs?.length ? <span className="ml-1 text-[#8f86ff]">{pos.reasonRefs.join(" ")}</span> : null}<br /><span className="text-praxis-400">{posMeta(pos)}</span></span>
                                  <b className="whitespace-nowrap text-praxis-700">{eur(pos.cents) || ""}</b>
                                </div>
                              ))}
                              {r.amountCents !== null && <div className="flex justify-between border-t-2 border-praxis-700/30 pt-2 text-xs"><span className="font-semibold text-praxis-500">{t("invoiceRecords.total", lang)}</span><b className="text-praxis-700">{eur(r.amountCents)}</b></div>}
                            </div>
                          ) : <p className="text-xs text-praxis-400">{t("invoiceRecords.noPositions", lang)}</p>}
                          {r.reasons.length > 0 && (
                            <p className="text-xs text-praxis-400"><b className="text-praxis-500">{t("invoiceRecords.reasons", lang)}</b> · {r.reasons.map(x => `${x.key ? x.key + " " : ""}${x.text}`).join(" · ")}</p>
                          )}
                        </>
                      )}

                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-praxis-400">{t("invoiceRecords.paymentHead", lang)}</p>
                          {r.payment ? (
                            <ul className="space-y-0.5 text-xs text-praxis-500">
                              <li>{t("invoiceRecords.paymentLine", lang, { paid: eur(r.payment.paidCents) || "0,00 €", open: eur(r.payment.openCents) || "0,00 €" })}</li>
                              {(r.payment.allocations ?? []).map((a, i) => <li key={i}>{day(a.bookedAt ?? a.booked_at) || "—"} · {eur(a.amountCents) || ""}{a.state && a.state !== "posted" ? ` · ${a.state}` : ""}</li>)}
                            </ul>
                          ) : <p className="text-xs text-praxis-500">{t(`invoiceRecords.pay.${p.key}`, lang)}. {t("invoiceRecords.paymentUnlinkedHint", lang)}</p>}
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-praxis-400">{t("invoiceRecords.deliveryHead", lang)}</p>
                          {r.delivery.length === 0 ? <p className="text-xs text-praxis-500">{t("invoiceRecords.delivery.none", lang)}</p> : (
                            <ul className="space-y-0.5 text-xs text-praxis-500">
                              {[...r.delivery].sort((a, b) => (a.at || "").localeCompare(b.at || "")).map((e, i) => (
                                <li key={i}>{stamp(e.at) || "—"} · {t(`invoiceRecords.event.${e.kind}`, lang)}{e.version === "history" ? ` (${t("invoiceRecords.eventHistory", lang)})` : ""}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {state === "ready" && orphans.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-praxis-400">{t("invoiceRecords.orphansHead", lang)}</p>
          <p className="mb-2 text-xs text-praxis-500">{t("invoiceRecords.orphansHint", lang)}</p>
          <div className="flex flex-wrap gap-2">
            {orphans.map(h => (
              <a key={h.id} href={`/api/rechnungsakte?historyId=${h.id}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-semibold text-praxis-500 hover:bg-surface-50">
                {t("invoiceRecords.summaryFrom", lang, { date: day(h.hochgeladen_am) || "" })}{h.amountCents !== undefined ? ` · ${eur(h.amountCents)}` : ""}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone: keyof typeof chip; hint?: string }) {
  return (
    <div className="rounded-lg border border-surface-200 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-praxis-400">{label}</p>
      <p className={`text-lg font-extrabold leading-tight ${tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : tone === "mid" ? "text-sky-600" : "text-praxis-700"}`}>{value}</p>
      {hint && <p className="text-[11px] text-praxis-400">{hint}</p>}
    </div>
  );
}

/** Ebene 3: das Blatt, wie es der Patient bekommt. Eigene helle Fläche, unabhängig vom Thema der Oberfläche. */
function InvoiceSheet({ r, lang }: { r: InvoiceRecord; lang: string }) {
  const qp = quarterParts(r.quarter);
  const serif = { fontFamily: "Fraunces, Georgia, serif" } as const;
  return (
    <div className="rounded-xl p-5 md:p-6" style={{ background: "#f7f3ea", color: "#1c2a22", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[.18em]" style={{ color: "#7a7f73" }}>{t("invoiceRecords.sheet.practice", lang)}</p>
          <p className="text-[26px] leading-none" style={{ ...serif, color: "#1f3b2d" }}>Dr. Schubert</p>
          <p className="text-[11px]" style={{ color: "#5a6058" }}>{t("invoiceRecords.sheet.subtitle", lang)}</p>
        </div>
        <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-right text-[12px]" style={{ color: "#5a6058" }}>
          <span>{t("invoiceRecords.sheet.number", lang)}</span><b style={{ color: "#1c2a22" }}>{r.invoiceNumber || r.key}</b>
          <span>{t("invoiceRecords.sheet.date", lang)}</span><b style={{ color: "#1c2a22" }}>{day(r.date) || "—"}</b>
        </div>
      </div>
      <p className="mt-4 text-[30px] leading-[1.05]" style={{ ...serif, color: "#1f3b2d" }}>
        {t("invoiceRecords.sheet.title", lang)} <i style={{ fontWeight: 300 }}>{qp ? `Q${qp.q}/${qp.y}` : r.quarter}</i>
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl px-4 py-4" style={{ background: "#1f3b2d", color: "#fff" }}>
        <div>
          <p className="text-[10px] uppercase tracking-[.16em]" style={{ color: "#b9c8bf" }}>{t("invoiceRecords.sheet.amountLabel", lang)}</p>
          <p className="text-[18px]" style={serif}>{t("invoiceRecords.sheet.amountTitle", lang)}</p>
        </div>
        <p className="text-[38px] leading-none" style={serif}>{eur(r.amountCents) ?? "—"}</p>
      </div>
      <div className="mt-4 text-[12.5px]">
        {r.positions.map((pos, i) => (
          <div key={i} className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-2.5 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid #e3dfd3" }}>
            <span style={{ color: "#7a7f73" }}>{dayShort(pos.date) || ""}</span>
            <span>{pos.text || ""}{pos.reasonRefs?.length ? <sup className="ml-1 text-[10px]" style={{ color: "#9a7a2f" }}>{pos.reasonRefs.join(" ")}</sup> : null}<br /><span className="text-[11px]" style={{ color: "#7a7f73" }}>{posMeta(pos)}</span></span>
            <b>{eur(pos.cents) || ""}</b>
          </div>
        ))}
        <div className="mt-1 flex justify-between pt-2 font-bold" style={{ borderTop: "2px solid #1f3b2d" }}><span>{t("invoiceRecords.total", lang)}</span><span>{eur(r.amountCents) ?? "—"}</span></div>
      </div>
      {r.reasons.length > 0 && (
        <div className="mt-4 text-[11.5px]" style={{ color: "#5a6058" }}>
          <p className="text-[10px] uppercase tracking-[.16em]" style={{ color: "#7a7f73" }}>{t("invoiceRecords.reasons", lang)}</p>
          {r.reasons.map((x, i) => <p key={i}>{x.key ? `${x.key} ` : ""}{x.text}</p>)}
        </div>
      )}
    </div>
  );
}
