'use client';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import { t } from '@/lib/i18n';

type Item = { id: string; external_id: string; first_name: string; last_name: string; reason: 'birthdate_missing'|'birthdate_invalid'; created_at: string };
export function ImportReviewList() {
  const { locale, theme } = useAppStore();
  const [page, setPage] = useState(0), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{items:Item[];total:number}|null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(false);
    void (async () => {
      try {
        const response = await fetch(`/api/anima-sign/import-reviews?page=${page}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw Error('read_failed');
        const data = await response.json();
        if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0 || data.items.some((r:Item) => !r || ['id','external_id','first_name','last_name','created_at'].some(k=>typeof r[k as keyof Item]!=='string') || !['birthdate_missing','birthdate_invalid'].includes(r.reason))) throw Error('invalid_result');
        if (controller.signal.aborted) return;
        const last = Math.max(0, Math.ceil(data.total / 15) - 1);
        if (page > last) { setPage(last); return; }
        setResult(data);
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [page, retry]);
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / 15));
  return <section className="ac-import-review" data-theme={theme} aria-labelledby="import-review-title" aria-busy={loading}>
    <style>{`.ac-import-review{padding-block:16px;border-block:1px solid currentColor;margin-block:16px;overflow-wrap:anywhere}.ac-import-review h3{font-size:18px;line-height:1.4;margin:0 0 12px}.ac-import-review p,.ac-import-review li{font-size:16px;line-height:1.5}.ac-import-review ul{list-style:none;padding:0;margin:16px 0}.ac-import-review li+li{margin-top:16px}.ac-import-review nav{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.ac-import-review button{min-height:44px;padding:8px 14px;border:1px solid currentColor;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}.ac-import-review button:focus-visible{outline:3px solid #176a40;outline-offset:3px}.ac-import-review button:hover:not(:disabled){text-decoration:underline;text-underline-offset:3px}.ac-import-review button:disabled{opacity:.5;cursor:default}.ac-import-review[data-theme=dark] button:focus-visible{outline-color:#4ade80}`}</style>
    <h3 id="import-review-title">{t('intake.importTitle',locale)}</h3>
    <p>{t('intake.importHelp',locale)}</p>
    {error ? <div role="alert"><p>{t('intake.reviewLoadError',locale)}</p><button onClick={()=>setRetry(x=>x+1)}>{t('intake.reviewRetry',locale)}</button></div>
      : loading ? <p role="status">{t('intake.reviewLoading',locale)}</p>
      : !result?.items.length ? <p>{t('intake.reviewEmpty',locale)}</p>
      : <><ul>{result.items.map(item=><li key={item.id}>
        <strong>{item.first_name} {item.last_name}</strong><br/>
        {t(`intake.${item.reason}`,locale)}<br/>
        <span>{t('intake.externalId',locale)}: {item.external_id}</span>
      </li>)}</ul><nav aria-label={t('intake.importTitle',locale)}>
        <button disabled={loading||page===0} onClick={()=>setPage(page-1)}>{t('intake.previous',locale)}</button>
        <span aria-live="polite">{t('intake.reviewPage',locale,{page:page+1,pages,total:result.total})}</span>
        <button disabled={loading||page+1>=pages} onClick={()=>setPage(page+1)}>{t('intake.next',locale)}</button>
      </nav></>}
  </section>;
}
