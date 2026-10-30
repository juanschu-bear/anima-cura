'use client';
import {useState} from 'react';
import {t} from '@/lib/i18n';
import {catalogOrigin, matchesReference, ruleOrigin} from '@/lib/practice-reference';
import {useThema} from './ScribeShell';
import type reference from '@/lib/practice-reference.json';
import styles from './practice-knowledge.module.css';

type Section = 'catalog'|'rules'|'questions';
export default function PracticeKnowledge({data, initial='catalog'}:{data:typeof reference;initial?:Section}) {
 const [section,setSection]=useState<Section>(initial);
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('all');
 const {wechseln}=useThema();
 const rows=Object.entries(data.catalog).flatMap(([key,group])=>group.rows.map((cells,index)=>({key,group,cells,index}))).filter(row=>(category==='all'||category===row.key)&&matchesReference(query,row.cells));
 const rules=data.rules.filter(rule=>matchesReference(query,rule));
 const questions=data.questions.filter(question=>matchesReference(query,question));
 function change(next:Section){setSection(next);setQuery('');}
 return <main className={styles.reference}>
  <header className={styles.heading}><div><p>Anima Scribe</p><h1>{t('knowledge.title')}</h1><p>{t('knowledge.version')}</p></div><div className={styles.actions}><a href='/scribe'>{t('knowledge.back')}</a><button onClick={wechseln}>{t('knowledge.theme')}</button></div></header>
  <aside className={styles.notice}><p>{t('knowledge.warning')}</p><details><summary>{t('knowledge.source')}</summary><p>{data.source}</p><p>{t('knowledge.approval')}</p></details></aside>
  <nav className={styles.tabs} aria-label={t('knowledge.title')}>{(['catalog','rules','questions'] as const).map(key=><button key={key} aria-pressed={section===key} onClick={()=>change(key)}>{t('knowledge.'+key)}</button>)}</nav>
  <div className={styles.filters}><label>{t('knowledge.search')}<input type='search' value={query} onChange={e=>setQuery(e.target.value)}/></label>{section==='catalog'&&<label>{t('knowledge.section')}<select value={category} onChange={e=>setCategory(e.target.value)}><option value='all'>{t('knowledge.all')}</option>{Object.entries(data.catalog).map(([key,group])=><option value={key} key={key}>{group.title}</option>)}</select></label>}</div>
  <p role='status'>{section==='catalog'?rows.length:section==='rules'?rules.length:questions.length} {t('knowledge.results')}</p>
  {section==='catalog'&&<div className={styles.cards}>{rows.map(({key,group,cells,index})=><article key={`${key}-${index}`}><span className={styles.badge}>{t('knowledge.'+catalogOrigin(key,index))}</span><p className={styles.context}>{group.title}</p><h2>{cells[0]} · {cells[1]}</h2><dl>{cells.slice(2).map((cell,i)=><div key={i}><dt>{group.cols[i+2]}</dt><dd>{cell||'—'}</dd></div>)}</dl><p className={styles.context}>{t('knowledge.original')} · 15.10.2026</p></article>)}</div>}
  {section==='rules'&&rules.map(rule=><details className={styles.rule} key={rule.id}><summary>{rule.name}<span>{t('knowledge.'+ruleOrigin(rule.source))}</span></summary><p className={styles.badge}>{t('knowledge.ruleStatus')}</p><p>{t('knowledge.source')}: {rule.source}</p><h3>{t('knowledge.trigger')}</h3><p>{rule.trigger}</p><h3>{t('knowledge.facts')}</h3><ul>{rule.facts.map((fact,i)=><li key={i}>{fact}</li>)}</ul><h3>{t('knowledge.exclusions')}</h3><ul>{rule.exclusions.map((fact,i)=><li key={i}>{fact}</li>)}</ul><h3>{t('knowledge.reason')}</h3><p>{rule.reason}</p>{rule.question&&<button onClick={()=>{setSection('questions');setQuery(rule.question!);}}>{t('knowledge.related')}</button>}</details>)}
  {section==='questions'&&<><p className={styles.notice}>{t('knowledge.questionsHelp')}</p>{questions.map(question=><article key={question.id}><h2>{question.title}</h2>{question.locks.length>0&&<div className={styles.actions}>{question.locks.map(rule=><button key={rule} onClick={()=>{setSection('rules');setQuery(rule);}}>{data.rules.find(r=>r.id===rule)?.name||rule}</button>)}</div>}</article>)}</>}
  {(section==='catalog'?rows.length===0:section==='rules'?rules.length===0:questions.length===0)&&<p>{t('knowledge.empty')}</p>}
 </main>;
}
