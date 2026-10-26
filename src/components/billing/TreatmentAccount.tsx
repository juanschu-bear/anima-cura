'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
import type { TreatmentAccount as Account } from '@/lib/treatment-account-api';
import type { Evidence } from '@/lib/treatment-account';
import styles from './BillingWorkspace.module.css';

export default function TreatmentAccount({ patientId, locale, theme }: { patientId: string; locale: 'de' | 'en'; theme: string }) {
  const [account, setAccount] = useState<Account | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  const [page, setPage] = useState(0), [invoicePage, setInvoicePage] = useState(0), [search, setSearch] = useState('');
  const [allocationPage, setAllocationPage] = useState(0);
  const tr = (key: string) => t(`treatment.${key}`, locale);
  useEffect(() => {
    const controller = new AbortController();
    setAccount(null); setError(''); setLoading(true); setPage(0); setInvoicePage(0);
    fetch(`/api/rechnungen/behandlungskonto/${encodeURIComponent(patientId)}?lang=${locale}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || tr('unavailable')); return data; })
      .then(data => { if (!controller.signal.aborted) setAccount(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : tr('unavailable')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [patientId, locale, retry]);
  const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', { timeZone: 'UTC' }).format(new Date(value)) : tr('unknown');
  const amount = (value: unknown) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
    ? new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(Number(value)) : tr('unknown');
  const source = (evidence: Evidence) => <dl><dt>{tr('source')}</dt><dd>{evidence.system === 'scribe' ? 'Anima-Scribe' : evidence.system}</dd><dt>{tr('reference')}</dt><dd>{evidence.recordId}</dd><dt>{tr('version')}</dt><dd>{evidence.version} · {evidence.locator}</dd></dl>;
  const pager = (current: number, total: number, change: (next: number) => void) => total > 15 && <nav className={styles.row} aria-label={tr('pages')}>
    <button disabled={current === 0} onClick={() => change(current - 1)}>{tr('previous')}</button>
    <span>{current + 1} / {Math.ceil(total / 15)}</span><button disabled={(current + 1) * 15 >= total} onClick={() => change(current + 1)}>{tr('next')}</button>
  </nav>;
  const events = account?.events.filter(event => `${event.text} ${event.date} ${event.material ?? ''}`.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale))) ?? [];
  return <main className={styles.root} data-theme={theme}>
    <Link href="/rechnungen">{tr('back')}</Link>
    <h1>{tr('title')}</h1><p className={styles.muted}>{tr('readOnly')}</p>
    {loading && <p role="status">{tr('loading')}</p>}
    {error && <div role="alert" className={styles.error}><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>{tr('retry')}</button></div>}
    {account && <>
      <header><h2>{account.patient.vorname} {account.patient.nachname}</h2><p>{tr('patientNumber')}: {account.patient.ivoris_nummer || tr('unknown')} · {tr('asOf')}: {date(account.asOf)}</p>
        <Link href={`/patienten/${patientId}`}>{tr('patientProfile')}</Link>
      </header>
      <section className={styles.panel} aria-labelledby="account-plan"><h2 id="account-plan">{tr('plan')}</h2>
        <dl><dt>{tr('treatmentQuarter')}</dt><dd>{account.quarter ?? tr('unknown')}</dd>
          <dt>{tr('calendarQuarter')}</dt><dd>{account.calendarQuarter}</dd>
          <dt>{tr('treatmentStart')}</dt><dd>{date(account.plan?.treatment_start)}</dd>
          <dt>{tr('legacyStart')}</dt><dd>{date(account.patient.behandlung_start)}</dd>
          <dt>{tr('insurer')}</dt><dd>{account.plan?.insurer ?? account.patient.krankenkasse ?? tr('unknown')}</dd>
          <dt>{tr('jaws')}</dt><dd>{account.plan?.jaws ? tr(`jaw.${account.plan.jaws}`) : tr('unknown')}</dd>
          <dt>{tr('history')}</dt><dd>{tr(account.history.known ? 'historyConfirmed' : 'unknown')}{account.history.from && ` · ${date(account.history.from)} – ${date(account.history.through)}`}</dd>
        </dl>
        <p className={styles.muted}>{tr('quarterExplanation')}</p>
        {account.plans.length ? account.plans.map(plan => <details key={`${plan.id}:${plan.revision}`}><summary>{tr('version')} {plan.revision} · {date(plan.valid_from)} – {date(plan.valid_to)}</summary>
          <p>{tr(plan.confirmed_at ? 'confirmed' : 'proposal')}</p>{source(plan.source)}
          <h3>{tr('quotas')}</h3>{plan.quotas.length ? <pre>{JSON.stringify(plan.quotas, null, 2)}</pre> : <p>{tr('unknown')}</p>}
        </details>) : <p>{tr('missing_plan')}</p>}
      </section>
      <section className={styles.panel} aria-labelledby="account-open"><h2 id="account-open">{tr('openPoints')}</h2>
        <ul>{account.issues.map(issue => <li key={issue}>{tr(issue)}</li>)}</ul>
      </section>
      <section className={styles.panel} aria-labelledby="account-events"><h2 id="account-events">{tr('events')}</h2>
        <label>{tr('search')}<input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} type="search" /></label>
        <p className={styles.muted}>{tr('eventExplanation')}</p>
        {!events.length && <p>{tr('noEvents')}</p>}
        <ul className={styles.list}>{events.slice(page * 15, page * 15 + 15).map(event => <li key={event.id}>
          <div className={`${styles.row} ${styles.spread}`}><strong>{date(event.date)}</strong><span className={styles.badge}>{tr(event.confirmed ? 'confirmed' : 'proposal')} · {tr(`state.${event.state}`)}</span></div>
          <p>{event.text}</p>{event.copied && <p className={styles.error}>{tr('copied')}</p>}
          <details><summary>{tr('evidence')}</summary><dl>
            <dt>{tr('component')}</dt><dd>{event.component ? tr(`component.${event.component}`) : tr('unknown')}</dd>
            <dt>{tr('jaws')}</dt><dd>{event.jaw ? tr(`jaw.${event.jaw}`) : tr('unknown')}</dd>
            <dt>{tr('teeth')}</dt><dd>{event.teeth.join(', ') || tr('unknown')}</dd>
            <dt>{tr('material')}</dt><dd>{event.material ?? tr('unknown')}</dd>
            <dt>{tr('quantity')}</dt><dd>{event.quantity ?? tr('unknown')}</dd></dl>{source(event.evidence)}
            {event.evidence.system === 'scribe' && <blockquote>{account.sourceEntries.find(entry => entry.id === event.evidence.recordId)?.text}</blockquote>}
          </details>
        </li>)}</ul>{pager(page, events.length, setPage)}
      </section>
      <section className={styles.panel} aria-labelledby="account-billing"><h2 id="account-billing">{tr('billingHistory')}</h2><p className={styles.muted}>{tr('summary_not_positions')}</p>
        {!account.historicalReferences.length && <p>{tr('noReferences')}</p>}
        <ul className={styles.list}>{account.historicalReferences.slice(invoicePage * 15, invoicePage * 15 + 15).map(item => <li key={item.id}>
          <strong>{item.rechnung_nr || item.unser_zeichen || tr('reference')}</strong><p>{date(item.rechnung_datum)} · {tr('recordedAmount')}: {amount(item.betrag)}</p>
          <details><summary>{tr('source')}</summary><p>{item.source_file || tr('unknown')}</p><p>{tr('reference')}: {item.id}</p></details>
        </li>)}</ul>{pager(invoicePage, account.historicalReferences.length, setInvoicePage)}
        <h3>{tr('allocations')}</h3>{account.allocations.length ? <ul className={styles.list}>{account.allocations.slice(allocationPage * 15, allocationPage * 15 + 15).map(item => <li key={item.id}>
          <strong>{item.data.quarter} {item.data.schedule}</strong><p>{tr(item.itemLevelProof ? 'transferredProof' : 'notTransferredProof')}</p>
          {item.data.raw && <p>{item.data.raw}</p>}<details><summary>{tr('evidence')}</summary>{source(item.source)}</details>
        </li>)}</ul> : <p>{tr('noAllocations')}</p>}{pager(allocationPage, account.allocations.length, setAllocationPage)}
      </section>
      <section className={styles.panel}><h2>{tr('baseline')}</h2><p>{tr('baselineExplanation')}</p>
        {account.baseline.length ? account.baseline.map(item => <details key={item.id}><summary>{date(item.before_date)}</summary><p>{item.note}</p>{source(item.source)}</details>) : <p>{tr('unknown')}</p>}
      </section>
    </>}
  </main>;
}
