'use client';
import {Menu} from 'lucide-react';
import {t} from '@/lib/i18n';
export default function KnowledgeMenu(){return <details style={{position:'relative'}} onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}>
 <summary className='thema-toggle' style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',minHeight:44}}><Menu aria-hidden='true' size={18}/>{t('knowledge.menu')}</summary>
 <nav aria-label={t('knowledge.title')} style={{position:'absolute',right:0,top:'calc(100% + 8px)',width:'min(290px,80vw)',padding:12,background:'var(--grund)',color:'var(--schrift)',border:'1px solid var(--gedeckt)',borderRadius:12,zIndex:20}}>
 {(['catalog','rules','questions'] as const).map(section=><a key={section} href={`/scribe?wissen=${section}`} target='_blank' rel='noopener noreferrer' title={t('knowledge.newTab')} style={{display:'block',padding:12,minHeight:44,textDecoration:'underline'}}>{t('knowledge.'+section)}</a>)}
 </nav>
</details>;}
