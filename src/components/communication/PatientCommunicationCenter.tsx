"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Clock3, Eye, FileText, Inbox, Mail, MessageSquare, RefreshCw, Search, UserRound } from "lucide-react";
import { t } from "@/lib/i18n";
import { inertEmailDocument, mailEvidence, type DispatchMessage, type InboundContact, type PatientDossier } from "@/lib/communication-insights";

const SIZE = 15;
function date(at: string | null | undefined, locale: string) {
  return at ? new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(at)) : "–";
}
function kind(row: DispatchMessage) { return row.campaign_key?.includes("invoice") ? "invoice" : row.campaign_key?.includes("clarification") ? "clarification" : "other"; }
function replyState(row: InboundContact) { return row.failed ? "failed" : row.autoReplied ? "autoReplied" : row.practiceNotified ? "notified" : row.manualReview ? "review" : "received"; }

export function PatientCommunicationCenter({ messages, inbound, repliesAvailable, selected, onSelect, locale, dark, busy }: {
  messages: DispatchMessage[]; inbound: InboundContact[]; repliesAvailable: boolean;
  selected: DispatchMessage | null; onSelect: (message: DispatchMessage | null) => void;
  locale: string; dark: boolean; busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const root = useRef<HTMLElement>(null);
  const surface = dark ? "border-white/10 bg-[#111722]" : "border-[#cbd6df] bg-white";
  const muted = dark ? "text-[#b0bdcd]" : "text-[#4b6076]";
  const rule = dark ? "border-white/10" : "border-[#d7e0e7]";
  useEffect(() => { if (selected) root.current?.scrollIntoView({ behavior: "auto", block: "start" }); }, [selected?.id]);
  const groups = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; number: string | null; messages: DispatchMessage[] }>();
    for (const row of messages) {
      const identities = row.patients?.length ? row.patients : [{ id: `contact:${row.recipient}`, name: row.patientName || row.recipient, number: row.patientNumber ?? null }];
      for (const patient of identities) {
        const group = grouped.get(patient.id) ?? { ...patient, messages: [] };
        group.messages.push(row); grouped.set(patient.id, group);
      }
    }
    return Array.from(grouped.values()).map(group => {
      const addresses = new Set(group.messages.map(row => row.recipient.toLowerCase()));
      return { ...group, addresses: Array.from(addresses),
        accepted: group.messages.filter(row => mailEvidence(row, "accepted")).length,
        delivered: group.messages.filter(row => mailEvidence(row, "delivered")).length,
        opened: group.messages.filter(row => mailEvidence(row, "opened")).length,
        problems: group.messages.some(row => ["failed", "bounced", "complained", "suppressed", "delayed"].includes(row.status)),
        portal: group.messages.some(row => row.portalEvents.some(event => event.patient_id === group.id && event.event_type === "app_open")),
        replies: inbound.filter(row => addresses.has(row.sender.toLowerCase())).length };
    }).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [messages, inbound, locale]);
  const filtered = groups.filter(group => {
    const match = `${group.name} ${group.number || ""} ${group.addresses.join(" ")}`.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale));
    return match && (filter === "all" || (filter === "problems" && group.problems) || (filter === "opened" && group.opened > 0) || (filter === "replies" && group.replies > 0) || (filter === "portal" && group.portal));
  });
  useEffect(() => { setPage(1); }, [query, filter]);
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / SIZE)));

  return <section ref={root} className={`mt-6 scroll-mt-5 overflow-hidden rounded-[14px] border ${surface}`}>
    {selected ? <PatientDossierView key={selected.id} seed={selected} locale={locale} dark={dark} onBack={() => onSelect(null)} /> : <>
      <div className={`flex flex-wrap items-end justify-between gap-4 border-b p-5 ${rule}`}>
        <div><h2 className="text-xl font-bold tracking-[-0.02em]">{t("dispatch.crm.title", locale)}</h2><p className={`mt-1 max-w-[70ch] text-sm leading-6 ${muted}`}>{t("dispatch.crm.intro", locale)}</p></div>
        <p className={`text-sm tabular-nums ${muted}`}>{t("dispatch.crm.count", locale, { patients: String(groups.filter(group => !group.id.startsWith("contact:")).length), messages: String(messages.length), addresses: String(new Set(messages.map(row => row.recipient.toLowerCase())).size) })}</p>
      </div>
      <div className={`flex flex-col items-stretch gap-3 border-b p-4 sm:flex-row sm:items-end ${rule}`}>
        <label className="min-w-0 flex-1"><span className={`mb-1.5 block text-sm font-medium ${muted}`}>{t("dispatch.crm.search", locale)}</span><span className="relative block"><Search size={17} aria-hidden className="absolute left-3 top-3.5" /><input className="input min-h-11 w-full pl-10" value={query} onChange={event => setQuery(event.target.value)} /></span></label>
        <label><span className={`mb-1.5 block text-sm font-medium ${muted}`}>{t("dispatch.crm.show", locale)}</span><select value={filter} onChange={event => setFilter(event.target.value)} className="input min-h-11 w-full sm:w-auto">{["all", "problems", "opened", "replies", "portal"].map(value => <option key={value} value={value}>{t(`dispatch.crm.filter.${value}`, locale)}</option>)}</select></label>
      </div>
      <div>
        <table className="block w-full table-fixed text-left text-sm lg:table">
          <caption className="sr-only">{t("dispatch.crm.tableCaption", locale)}</caption>
          <thead className={`hidden lg:table-header-group ${dark ? "bg-white/[0.025]" : "bg-slate-50"} ${muted}`}><tr>
            <th scope="col" className="w-[30%] px-5 py-3 font-medium">{t("dispatch.crm.column.contact", locale)}</th>
            <th scope="col" className="w-[21%] px-5 py-3 font-medium">{t("dispatch.crm.column.recordedMail", locale)}</th>
            <th scope="col" className="w-[31%] px-5 py-3 font-medium">{t("dispatch.crm.column.state", locale)}</th>
            <th scope="col" className="w-[18%]"><span className="sr-only">{t("dispatch.crm.readMail", locale)}</span></th>
          </tr></thead>
          <tbody className="block lg:table-row-group">{filtered.slice((activePage - 1) * SIZE, activePage * SIZE).map(group => <tr key={group.id} className={`grid gap-4 border-t px-5 py-4 sm:grid-cols-2 lg:table-row lg:p-0 ${rule} transition-colors hover:bg-emerald-400/[0.04]`}>
            <td className="min-w-0 sm:col-span-2 lg:px-5 lg:py-4 lg:align-top">
              <button type="button" className="min-h-11 break-words text-left font-semibold leading-6 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-400" onClick={() => onSelect(group.messages[0])}>{group.name}<span className={`block text-xs font-normal ${muted}`}>{group.number ? t("dispatch.crm.patientNumber", locale, { number: group.number }) : t("dispatch.notAssigned", locale)}</span></button>
              <p className={`mt-1 break-all text-xs leading-5 ${muted}`}>{group.addresses.join(" · ")}</p>
            </td>
            <td className="min-w-0 lg:px-5 lg:py-4 lg:align-top">
              <span className={`mb-1 block text-xs lg:hidden ${muted}`}>{t("dispatch.crm.column.recordedMail", locale)}</span>
              <p className="font-semibold tabular-nums leading-6">{t(group.messages.length === 1 ? "dispatch.crm.emailOne" : "dispatch.crm.emailMany", locale, { count: String(group.messages.length) })}</p>
              {(["invoice", "clarification", "other"] as const).map(type => { const count = group.messages.filter(row => kind(row) === type).length; return count > 0 && <p key={type} className={`text-xs leading-5 ${muted}`}>{t(`dispatch.crm.mailType.${type}`, locale, { count: String(count) })}</p>; })}
            </td>
            <td className="min-w-0 lg:px-5 lg:py-4 lg:align-top">
              <span className={`mb-1 block text-xs lg:hidden ${muted}`}>{t("dispatch.crm.column.state", locale)}</span>
              <p className={`flex items-start gap-1.5 font-medium leading-6 ${group.problems ? (dark ? "text-amber-300" : "text-amber-800") : group.delivered === group.messages.length ? (dark ? "text-emerald-300" : "text-emerald-800") : ""}`}>
                {group.problems && <AlertCircle size={16} className="mt-1 shrink-0" aria-hidden />}
                {group.delivered === group.messages.length && !group.problems && <Check size={16} className="mt-1 shrink-0" aria-hidden />}
                {t(group.problems ? "dispatch.crm.state.problem" : group.delivered ? "dispatch.crm.state.delivered" : group.accepted ? "dispatch.crm.state.handedOver" : "dispatch.crm.state.unconfirmed", locale, { count: String(group.delivered || group.accepted), total: String(group.messages.length) })}
              </p>
              {!group.problems && !group.delivered && group.accepted > 0 && <p className={`text-xs leading-5 ${muted}`}>{t("dispatch.crm.deliveryUnconfirmed", locale)}</p>}
              {(group.opened > 0 || group.replies > 0 || group.portal || !repliesAvailable) && <ul className={`mt-2 space-y-1 text-xs leading-5 ${muted}`}>
                {group.opened > 0 && <li className="flex items-start gap-1.5"><Eye size={14} className="mt-0.5 shrink-0" aria-hidden />{t(group.opened === 1 ? "dispatch.crm.openActivityOne" : "dispatch.crm.openActivityMany", locale, { count: String(group.opened) })}</li>}
                {repliesAvailable && group.replies > 0 && <li className="flex items-start gap-1.5"><MessageSquare size={14} className="mt-0.5 shrink-0" aria-hidden />{t(group.replies === 1 ? "dispatch.crm.replyActivityOne" : "dispatch.crm.replyActivityMany", locale, { count: String(group.replies) })}</li>}
                {!repliesAvailable && <li>{t("dispatch.crm.replyStatusUnavailable", locale)}</li>}
                {group.portal && <li className="flex items-start gap-1.5"><UserRound size={14} className="mt-0.5 shrink-0" aria-hidden />{t("dispatch.crm.portalActivity", locale)}</li>}
              </ul>}
            </td>
            <td className="min-w-0 sm:col-span-2 lg:px-4 lg:py-4 lg:align-top"><button type="button" onClick={() => onSelect(group.messages[0])} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold ${dark ? "text-emerald-300" : "text-emerald-800"} hover:bg-emerald-400/10 focus-visible:outline-2 focus-visible:outline-emerald-400`} aria-label={`${t("dispatch.crm.readMail", locale)}: ${group.name}`}>{t("dispatch.crm.readMail", locale)}<ChevronRight size={16} className="shrink-0" aria-hidden /></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!filtered.length && <p className={`px-5 py-12 text-center ${muted}`}>{t(busy ? "dispatch.loading" : "dispatch.empty", locale)}</p>}
      <Pager page={activePage} total={filtered.length} onChange={setPage} locale={locale} />
      <details className={`border-t px-5 py-3 text-xs leading-5 ${rule} ${muted}`}><summary className="cursor-pointer py-1 font-medium focus-visible:outline-2 focus-visible:outline-emerald-400">{t("dispatch.crm.explain", locale)}</summary><p className="mt-2 max-w-[85ch]">{t("dispatch.crm.indexNote", locale)} {t("dispatch.crm.evidenceNote", locale)}</p></details>
    </>}
  </section>;
}

function Signal({ positive, label, dark }: { positive: boolean; label: string; dark: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 ${positive ? (dark ? "text-emerald-300" : "text-emerald-800") : (dark ? "text-[#b0bdcd]" : "text-[#4b6076]")}`}>{positive ? <Check size={15} aria-hidden /> : <Clock3 size={14} aria-hidden />}{label}</span>;
}

function Pager({ page, total, onChange, locale }: { page: number; total: number; onChange: (page: number) => void; locale: string }) {
  if (!total) return null;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  return <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
    <span className="tabular-nums">{t("dispatch.pagination.summary", locale, { start: String((page - 1) * SIZE + 1), end: String(Math.min(page * SIZE, total)), total: String(total) })}</span>
    {pages > 1 && <div className="flex items-center gap-2"><button type="button" className="btn btn-secondary min-h-11 disabled:opacity-40" disabled={page === 1} onClick={() => onChange(page - 1)} aria-label={t("dispatch.pagination.prev", locale)}><ChevronLeft size={16} /></button><span className="tabular-nums">{page} / {pages}</span><button type="button" className="btn btn-secondary min-h-11 disabled:opacity-40" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={t("dispatch.pagination.next", locale)}><ChevronRight size={16} /></button></div>}
  </div>;
}

function PatientDossierView({ seed, locale, dark, onBack }: { seed: DispatchMessage; locale: string; dark: boolean; onBack: () => void }) {
  const [data, setData] = useState<PatientDossier | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState("messages");
  const [messageId, setMessageId] = useState(seed.id);
  const [page, setPage] = useState(1);
  const muted = dark ? "text-[#b0bdcd]" : "text-[#4b6076]";
  const rule = dark ? "border-white/10" : "border-[#d7e0e7]";
  useEffect(() => {
    const controller = new AbortController(); setError(false); setData(null);
    fetch(`/api/kommunikation/${seed.id}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      setData(await response.json());
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [seed.id, retry]);
  useEffect(() => { setPage(1); }, [tab]);
  const selected = data?.messages.find(row => row.id === messageId) ?? seed;
  const patientNames = data?.patients.map(patient => patient.name).join(" · ") || seed.patientName || seed.patients?.map(patient => patient.name).join(" · ") || seed.recipient;
  const mailRows = data?.messages ?? [];
  useEffect(() => {
    if (tab === "messages" && data) setPage(Math.floor(Math.max(0, data.messages.findIndex(row => row.id === messageId)) / SIZE) + 1);
  }, [tab, messageId, data]);
  const timeline = useMemo(() => [
    ...(data?.messages.flatMap(message => message.events.map(event => ({ id: event.id, at: event.occurred_at, type: event.event_type, context: message.subject, messageId: message.id }))) ?? []),
    ...(data?.portalEvents.map((event, index) => ({ id: event.id || `portal-${index}`, at: event.created_at, type: event.event_type, context: data.patients.find(patient => patient.id === event.patient_id)?.name || "", messageId: null })) ?? []),
    ...(data?.inbound.map(event => ({ id: event.id, at: event.receivedAt, type: "reply_received", context: event.subject, messageId: null })) ?? []),
  ].sort((a, b) => b.at.localeCompare(a.at)), [data]);
  const records = tab === "messages" ? mailRows.length : tab === "replies" ? data?.inbound.length ?? 0 : tab === "documents" ? data?.documents.length ?? 0 : timeline.length;
  const activePage = Math.min(page, Math.max(1, Math.ceil(records / SIZE)));
  const slice = <T,>(rows: T[]) => rows.slice((activePage - 1) * SIZE, activePage * SIZE);

  return <>
    <header className={`border-b p-5 ${rule}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className="btn btn-secondary min-h-11" onClick={onBack}><ArrowLeft size={16} />{t("dispatch.crm.back", locale)}</button><span className={`text-xs ${muted}`}>{t("dispatch.crm.timezone", locale)}</span></div>
      <h2 className="mt-5 break-words text-2xl font-bold tracking-[-0.02em]">{patientNames}</h2>
      {data && data.patients.length > 1 && <p className={`mt-2 text-sm leading-6 ${muted}`}>{t("dispatch.crm.family", locale)}</p>}
      {data && <div className={`mt-5 grid gap-5 border-t pt-5 md:grid-cols-[1.4fr_1fr_1fr] ${rule}`}>
        <div><h3 className={`mb-2 flex items-center gap-2 text-sm font-medium ${muted}`}><UserRound size={16} />{t("dispatch.crm.login", locale)}</h3>{data.patients.map(patient => <div key={patient.id} className="mb-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><Link className="underline-offset-4 hover:underline" href={`/patienten/${patient.id}`}>{patient.name} <ArrowUpRight className="inline" size={13} /></Link><Signal positive={patient.login.state === "used"} dark={dark} label={t(`dispatch.crm.login.${patient.login.state}`, locale)} /></div>{patient.login.lastAt && <div className={`mt-1 text-xs ${muted}`}>{t("dispatch.crm.lastLogin", locale)} {date(patient.login.lastAt, locale)}</div>}</div>)}{!data.patients.length && <p className="text-sm">{t("dispatch.notAssigned", locale)}</p>}</div>
        <div><h3 className={`mb-2 flex items-center gap-2 text-sm font-medium ${muted}`}><Inbox size={16} />{t("dispatch.crm.mailSummary", locale)}</h3><p className="text-sm leading-7">{t("dispatch.crm.mailSummaryText", locale, { total: String(mailRows.length), delivered: String(mailRows.filter(row => mailEvidence(row, "delivered")).length), opened: String(mailRows.filter(row => mailEvidence(row, "opened")).length) })}</p></div>
        <div><h3 className={`mb-2 flex items-center gap-2 text-sm font-medium ${muted}`}><MessageSquare size={16} />{t("dispatch.crm.contact", locale)}</h3><p className="text-sm leading-7">{data.availability.replies ? t("dispatch.crm.contactSummary", locale, { count: String(data.inbound.length), review: String(data.inbound.filter(row => row.manualReview).length) }) : t("dispatch.crm.repliesUnavailable", locale)}</p></div>
      </div>}
    </header>
    {error ? <div role="alert" className="p-6"><p>{t("dispatch.loadError", locale)}</p><button className="btn btn-secondary mt-3" onClick={() => setRetry(value => value + 1)}><RefreshCw size={16} />{t("dispatch.refresh", locale)}</button></div> : !data ? <p className={`flex items-center gap-2 p-8 ${muted}`} role="status"><RefreshCw size={18} className="animate-spin" />{t("dispatch.loading", locale)}</p> : <>
      {data.truncated && <p className="px-5 py-3 text-sm text-amber-500">{t("dispatch.crm.truncated", locale)}</p>}
      <nav className={`flex flex-wrap gap-1 border-b px-4 ${rule}`} aria-label={t("dispatch.crm.sections", locale)}>{["messages", "replies", "documents", "history"].map(key => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)} className={`min-h-12 shrink-0 border-b-2 px-3 text-sm font-semibold ${tab === key ? (dark ? "border-emerald-400 text-emerald-300" : "border-emerald-700 text-emerald-800") : `border-transparent ${muted}`} focus-visible:outline-2 focus-visible:outline-emerald-400`}>{t(`dispatch.crm.tab.${key}`, locale)} <span className="ml-1 text-xs tabular-nums">{key === "messages" ? mailRows.length : key === "replies" ? data.inbound.length : key === "documents" ? data.documents.length : timeline.length}</span></button>)}</nav>
      {tab === "messages" && <div className="grid min-w-0 lg:grid-cols-[320px_minmax(0,1fr)]">
        <label className={`block min-w-0 border-b p-5 lg:hidden ${rule}`}><span className="mb-2 block text-sm font-semibold">{t("dispatch.crm.selectEmail", locale)}</span><select className="input min-h-11 w-full min-w-0" value={messageId} onChange={event => setMessageId(event.target.value)}>{mailRows.map(row => <option value={row.id} key={row.id}>{date(row.sent_at || row.created_at, locale)} · {row.subject}</option>)}</select></label>
        <div className={`hidden min-w-0 border-r lg:block ${rule}`}><div className="max-h-[760px] overflow-y-auto">{slice(mailRows).map(row => <button type="button" key={row.id} onClick={() => setMessageId(row.id)} aria-pressed={messageId === row.id} className={`block w-full border-b px-5 py-4 text-left ${rule} ${messageId === row.id ? (dark ? "bg-emerald-400/10" : "bg-emerald-50") : "hover:bg-emerald-400/[0.04]"}`}><span className={`text-xs font-semibold ${muted}`}>{t(`dispatch.messageKind.${kind(row)}`, locale)} · {date(row.sent_at || row.created_at, locale)}</span><span className="mt-2 block break-words text-sm font-semibold leading-6">{row.subject}</span><span className={`mt-1 block break-all text-xs ${muted}`}>{row.recipient}</span><span className="mt-2 block text-xs">{t(`dispatch.status.${row.status}`, locale)}</span></button>)}</div><Pager page={activePage} total={mailRows.length} onChange={setPage} locale={locale} /></div>
        <EmailPreview key={selected.id} row={selected} locale={locale} dark={dark} />
      </div>}
      {tab === "replies" && <div className="p-5"><p className={`max-w-[75ch] text-sm leading-6 ${muted}`}>{t("dispatch.crm.replyScope", locale)}</p><Link href="/support-zentrale" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4">{t("dispatch.crm.support", locale)}<ArrowUpRight size={15} /></Link>{!data.availability.replies ? <p role="alert" className="py-6">{t("dispatch.crm.repliesUnavailable", locale)}</p> : <>{slice(data.inbound).map(row => <article className={`border-t py-5 ${rule}`} key={row.id}><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{row.subject || t("dispatch.crm.noSubject", locale)}</h3><time className={`text-sm ${muted}`}>{date(row.receivedAt, locale)}</time></div><p className={`mt-1 break-all text-sm ${muted}`}>{row.sender}</p><p className="mt-2 text-sm">{t(`dispatch.crm.reply.${replyState(row)}`, locale)}</p></article>)}{!data.inbound.length && <p className={`py-8 ${muted}`}>{t("dispatch.crm.noRecordedReply", locale)}</p>}<Pager page={activePage} total={data.inbound.length} onChange={setPage} locale={locale} /></>}</div>}
      {tab === "documents" && <div className="p-5"><p className={`max-w-[75ch] text-sm leading-6 ${muted}`}>{t("dispatch.crm.documentNote", locale)}</p>{!data.availability.documents && <p role="alert">{t("dispatch.crm.documentsUnavailable", locale)}</p>}{slice(data.documents).map(document => <article key={document.id} className={`flex flex-wrap items-center justify-between gap-4 border-b py-5 ${rule}`}><div><a href={`/api/patient/dokumente/${document.id}/datei`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 font-semibold underline-offset-4 hover:underline"><FileText size={17} />{document.name}<ArrowUpRight size={15} /></a><p className={`text-sm ${muted}`}>{data.patients.find(patient => patient.id === document.patient_id)?.name}</p></div><div className="text-sm"><Signal positive={Boolean(document.openedAt)} dark={dark} label={t(document.openedAt ? "dispatch.crm.pdfRetrieved" : "dispatch.crm.noDocumentEvidence", locale)} />{document.openedAt && <p className={`mt-1 text-xs ${muted}`}>{date(document.openedAt, locale)}</p>}</div></article>)}{data.availability.documents && !data.documents.length && <p className={`py-8 ${muted}`}>{t("dispatch.crm.noDocuments", locale)}</p>}<Pager page={activePage} total={data.documents.length} onChange={setPage} locale={locale} /><div className={`mt-5 border-t pt-5 ${rule}`}><h3 className="font-semibold">{t("dispatch.crm.paymentActivity", locale)}</h3><p className={`mt-2 text-sm ${muted}`}>{t("dispatch.crm.paymentNote", locale)}</p>{["payment_view", "qrcode_view", "ratenplan_view"].map(type => { const at = data.portalEvents.find(event => event.event_type === type)?.created_at; return <div key={type} className="mt-3 flex flex-wrap justify-between gap-2 text-sm"><span>{t(`dispatch.event.${type}`, locale)}</span><Signal positive={Boolean(at)} dark={dark} label={at ? date(at, locale) : t(data.availability.portal ? "dispatch.crm.noSignal" : "dispatch.crm.unknown", locale)} /></div>; })}</div></div>}
      {tab === "history" && <div className="p-5"><p className={`text-sm leading-6 ${muted}`}>{t("dispatch.crm.historyNote", locale)}</p><ol className="mt-5">{slice(timeline).map(event => <li key={event.id} className={`flex gap-4 border-b py-4 ${rule}`}><time className={`w-32 shrink-0 text-xs tabular-nums leading-5 ${muted}`}>{date(event.at, locale)}</time><div className="min-w-0"><p className="text-sm font-semibold">{t(`dispatch.event.${event.type}`, locale)}</p>{event.messageId ? <button type="button" onClick={() => { setMessageId(event.messageId!); setTab("messages"); }} className={`mt-1 break-words text-left text-sm underline underline-offset-4 ${muted}`}>{event.context}</button> : <p className={`mt-1 break-words text-sm ${muted}`}>{event.context}</p>}</div></li>)}</ol>{!timeline.length && <p className={`py-8 ${muted}`}>{t("dispatch.noEvents", locale)}</p>}<Pager page={activePage} total={timeline.length} onChange={setPage} locale={locale} /></div>}
    </>}
  </>;
}

type Preview = { available: boolean; contentRestricted?: boolean; html?: string; text?: string; from?: string; replyTo?: string[]; source?: string; transportStatus?: string; checkedAt?: string };
function EmailPreview({ row, locale, dark }: { row: DispatchMessage; locale: string; dark: boolean }) {
  const [content, setContent] = useState<Preview | null>(null);
  const [textMode, setTextMode] = useState(false);
  const [retry, setRetry] = useState(0);
  const muted = dark ? "text-[#b0bdcd]" : "text-[#4b6076]";
  const rule = dark ? "border-white/10" : "border-[#d7e0e7]";
  useEffect(() => {
    const controller = new AbortController(); setContent(null);
    fetch(`/api/kommunikation/${row.id}/inhalt`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(); setContent(await response.json());
    }).catch(() => { if (!controller.signal.aborted) setContent({ available: false }); });
    return () => controller.abort();
  }, [row.id, retry]);
  const srcDoc = useMemo(() => content?.html ? inertEmailDocument(content.html) : "", [content?.html]);
  return <div className="min-w-0 p-5">
    <h3 className="break-words text-lg font-bold leading-7">{row.subject}</h3>
    <dl className={`mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm ${muted}`}><dt>{t("dispatch.table.recipient", locale)}</dt><dd className="break-all">{row.recipient}</dd><dt>{t("dispatch.table.sent", locale)}</dt><dd>{date(row.sent_at, locale)}</dd>{content?.from && <><dt>{t("dispatch.crm.from", locale)}</dt><dd className="break-all">{content.from}</dd></>}{Boolean(content?.replyTo?.length) && <><dt>{t("dispatch.crm.replyTo", locale)}</dt><dd className="break-all">{content!.replyTo!.join(", ")}</dd></>}</dl>
    <div className={`my-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y py-4 text-xs sm:grid-cols-4 ${rule}`}>{["accepted", "delivered", "opened", "clicked"].map(type => { const at = mailEvidence(row, type as "accepted" | "delivered" | "opened" | "clicked"); return <div key={type}><p className="mb-1.5 font-semibold">{t(`dispatch.crm.evidence.${type}`, locale)}</p><Signal positive={Boolean(at)} dark={dark} label={at ? date(at, locale) : t("dispatch.crm.noSignal", locale)} /></div>; })}</div>
    <p className={`text-xs leading-5 ${muted}`}>{t("dispatch.crm.evidenceNote", locale)}</p>
    {content?.transportStatus && <p className={`mt-2 text-xs ${muted}`}>{t("dispatch.crm.liveStatus", locale)}: {t(`dispatch.status.${content.transportStatus === "sent" ? "accepted" : content.transportStatus === "delivery_delayed" ? "delayed" : content.transportStatus}`, locale)} · {date(content.checkedAt, locale)}</p>}
    {!content ? <p role="status" className={`flex items-center gap-2 py-10 ${muted}`}><RefreshCw className="animate-spin" size={16} />{t("dispatch.crm.loadingOriginal", locale)}</p> : content.contentRestricted ? <p className={`py-8 text-sm leading-6 ${muted}`}>{t("dispatch.crm.securityContent", locale)}</p> : content.available ? <>
      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-sm font-semibold"><Mail size={16} />{t("dispatch.crm.original", locale)}</span><button type="button" className="btn btn-secondary min-h-11 text-sm" onClick={() => setTextMode(value => !value)}>{t(textMode ? "dispatch.crm.design" : "dispatch.crm.plainText", locale)}</button></div>
      {textMode || !srcDoc ? <pre className={`max-h-[700px] overflow-auto whitespace-pre-wrap break-words rounded-xl border p-5 font-sans text-sm leading-7 ${rule}`}>{content.text || t("dispatch.crm.noPlainText", locale)}</pre> : <iframe title={t("dispatch.crm.original", locale)} sandbox="" referrerPolicy="no-referrer" srcDoc={srcDoc} className="h-[650px] w-full rounded-xl bg-white" />}
      <p className={`mt-2 text-xs leading-5 ${muted}`}>{t("dispatch.crm.previewNote", locale)}</p>
    </> : <div className={`mt-6 rounded-xl border p-5 ${rule}`}><Eye size={22} className={muted} /><h4 className="mt-3 font-semibold">{t("dispatch.crm.originalUnavailable", locale)}</h4><p className={`mt-2 text-sm leading-6 ${muted}`}>{t("dispatch.crm.originalUnavailableText", locale)}</p><button type="button" className="btn btn-secondary mt-4" onClick={() => setRetry(value => value + 1)}>{t("dispatch.refresh", locale)}</button></div>}
  </div>;
}
