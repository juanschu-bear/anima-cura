'use client';
import { useCallback, useEffect, useId, useState } from 'react';
import { t } from '@/lib/i18n';
import type { ScribeRoom } from '@/lib/scribe-rooms';

export default function ScribeRoomPicker({ value, onChange, legacy = false, disabled = false }: { value: string; onChange: (id: string) => void; legacy?: boolean; disabled?: boolean }) {
  const id = useId();
  const [rooms,setRooms] = useState<ScribeRoom[]>([]);
  const [versions,setVersions] = useState<ScribeRoom[]>([]);
  const [canManage,setCanManage] = useState(false);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [editing,setEditing] = useState<ScribeRoom | null>(null);
  const [name,setName] = useState('');
  const [active,setActive] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/doku/eintrag', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setRooms(json.rooms); setVersions(json.versions); setCanManage(json.canManage);
    } catch { setError(t('scribe.room.loadError')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); },[load]);
  const selected = versions.find(r => r.id === value);
  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/doku/eintrag',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:editing?.room_id ?? crypto.randomUUID(),version:(editing?.version ?? 0)+1,name,active})});
      if (!res.ok) throw new Error();
      setName(''); setEditing(null); setActive(true); await load();
    } catch { setError(t('scribe.room.saveError')); }
    finally { setBusy(false); }
  }
  return <section aria-label={t('scribe.room.label')} style={{padding:'12px 16px',border:'1px solid currentColor',borderRadius:12,background:'var(--panel, #152c32)',color:'var(--text, #f1f5f4)',maxWidth:540}}>
    <label htmlFor={id} style={{display:'block',fontWeight:600,marginBottom:6}}>{t('scribe.room.label')}{!legacy && ' *'}</label>
    <select id={id} value={value} required={!legacy} disabled={loading || disabled || busy} onChange={e=>onChange(e.target.value)} style={{width:'100%',padding:10,color:'#122c30',background:'#fff',borderRadius:8}}>
      <option value="" disabled={!legacy || !!value}>{t(legacy ? 'scribe.room.unknown':'scribe.room.choose')}</option>
      {selected && !rooms.some(r=>r.id===value && r.active) && <option value={value}>{selected.name}</option>}
      {rooms.filter(r=>r.active).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={loading || busy} onClick={()=>void load()}>{t('scribe.room.retry')}</button>
    {canManage && <details style={{marginTop:8}}><summary>{t('scribe.room.manage')}</summary>
      <select aria-label={t('scribe.room.manage')} disabled={busy} value={editing?.id ?? ''} onChange={e=>{const r=rooms.find(r=>r.id===e.target.value) ?? null;setEditing(r);setName(r?.name ?? '');setActive(r?.active ?? true);}} style={{color:'#122c30',background:'#fff',width:'100%',padding:8}}>
        <option value="">{t('scribe.room.new')}</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <label style={{display:'block'}}>{t('scribe.room.name')}<input value={name} disabled={busy} maxLength={80} onChange={e=>setName(e.target.value)} style={{color:'#122c30',background:'#fff',padding:8,width:'100%'}} /></label>
      <label><input type="checkbox" checked={active} disabled={busy} onChange={e=>setActive(e.target.checked)} /> {t('scribe.room.active')}</label>
      <button type="button" disabled={busy || !name.trim()} onClick={()=>void save()} style={{display:'block',padding:8}}>{t('scribe.room.save')}</button>
    </details>}
  </section>;
}
