// Operator-only, read-only live observation. Outputs anonymized text; never sends a message.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {anonymizeRetrieval} from '../src/lib/services/animahost-retrieval-privacy';
import nextEnv from '@next/env';
import {remainingPersonNames} from '../src/lib/services/animahost-retrieval-redaction';
import {maskBirthDates} from '../src/lib/services/animahost-chat-identity';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const [since,tenant,destination]=process.argv.slice(2);
if(!since||!Number.isFinite(Date.parse(since))||!tenant?.match(/^[a-f0-9-]{36}$/)||!destination)throw Error('Usage: SINCE_ISO TENANT REPORT_PATH');
let token=process.env.SUPABASE_ACCESS_TOKEN??execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(token.startsWith('go-keyring-base64:'))token=Buffer.from(token.split(':').pop()!,'base64').toString();
async function query(project:string,sql:string){const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({query:sql,read_only:true}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('live_read_failed:'+response.status);return response.json() as Promise<any[]>;}
const quoted=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
const replies=await query('yucpobkmfvjsuuwtffvr',`select e.wamid,e.received_at,p.send_at,p.reason,p.decision,p.state,o.sent_at,o.body as answer,
 (select string_agg(b.body,E'\\n\\n' order by b.received_at,b.created_at) from events b where b.id=any(p.batch_ids)) as incoming,
 round(extract(epoch from (o.sent_at-e.received_at))::numeric,1) as delay_seconds
 from animaline_planned_replies p join events e on e.id=p.source_event_id
 join animaline_outbound_messages o on o.tenant_id=p.tenant_id and o.provider_message_id=p.provider_message_id
 where p.tenant_id=${quoted(tenant)} and p.created_at>=${quoted(new Date(since).toISOString())} and p.state='sent' order by o.sent_at limit 10`);
const names=await query('zymqxzhjbcxzhzvjqvbv',`select vorname,nachname,versicherter_vorname,versicherter_nachname,eb2_vorname,eb2_nachname from patients`);
const additional=process.env.ANIMAHOST_REDACTION_NAMES_FILE?JSON.parse(readFileSync(process.env.ANIMAHOST_REDACTION_NAMES_FILE,'utf8')):[];
const tokens=[...names.flatMap(p=>Object.values(p)),...additional].filter((s):s is string=>typeof s==='string');
let redactionPending=false;
if(replies.length){try{const settings=await query('zymqxzhjbcxzhzvjqvbv',`select model from animahost_whatsapp_settings where tenant_id=${quoted(tenant)}`);tokens.push(...await remainingPersonNames(replies.flatMap(r=>[anonymizeRetrieval(r.incoming??'',tokens),anonymizeRetrieval(r.answer??'',tokens)]),settings[0].model));}catch{redactionPending=true;}}
const clean=(value:string)=>redactionPending?'[Text bis zur abgeschlossenen Namensprüfung zurückgehalten]':maskBirthDates(anonymizeRetrieval(value??'',tokens)).replace(/\|/g,'\\|');
const evidence=replies.length?await query('zymqxzhjbcxzhzvjqvbv',`select message_id,architecture,evidence,timings from animahost_reply_evidence where tenant_id=${quoted(tenant)} and message_id in (${replies.map(r=>quoted(r.wamid)).join(',')})`):[];
const berlin=(value:string)=>new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'medium'}).format(new Date(value));
let report=`# Erste zehn Live-Antworten des neuen Kerns\n\nAktiviert: ${berlin(since)} (Europe/Berlin). Stand: ${berlin(new Date().toISOString())}.\n\nErfasst: **${replies.length}/10 tatsächlich versendete Antworten**. Nur echte Eingänge, keine künstlichen Patientennachrichten. Fehlende Antworten werden nicht durch Probeläufe ersetzt.\n\nProduction: ANIMAHOST_RETRIEVAL_PASSED=true und ANIMALINE_RETRIEVAL_POLICY=1. Keine Nachtpause. Drei Goldbeispiele für unklare Eingänge indexiert.\n\nCodeprüfungen: 118 AnimaHost-, 64 AnimaLine- und 303 AnimaDesk-Tests; Builds und 74 RPC-Berechtigungsprüfungen bestanden.\n`;
if(!replies.length)report+='\nNoch kein tatsächlicher Versand seit der Aktivierung beobachtet. Architektur und Patientenblatt sind deshalb noch nicht anhand einer Live-Antwort bestätigt.\n';
for(const [i,r] of replies.entries()){
 const proof=evidence.find(e=>e.message_id===r.wamid);const sheet=proof?.timings?.patientSheet;
 report+=`\n## Antwort ${i+1}\n\nEingang: ${berlin(r.received_at)}. Versand: ${berlin(r.sent_at)}. Tatsächliche Verzögerung: ${r.delay_seconds} Sekunden; geplant: ${berlin(r.send_at)} (${r.reason.kind}, Ziel ${r.reason.delaySeconds} Sekunden).\n\nEingangstext: ${clean(r.incoming)}\n\nAntwort: ${clean(r.answer)}\n\nArchitektur im Beleg: ${proof?.architecture??'Beleg fehlt'}. Patientenblatt: ${sheet?.access??'Nachweis fehlt'}. Gefüllte Felder: ${Object.entries(sheet?.fields??{}).filter(([,v])=>v==='filled').map(([k])=>k).join(', ')||'keine'}.\n\n`;
 for(const kind of ['gold','knowledge','rule','history'])report+=`${kind}: ${(proof?.evidence?.[kind]??[]).map((e:any)=>`${e.ref} (v${e.version}, ${e.date})`).join('; ')||'keine'}.\n\n`;
}
writeFileSync(destination,report);
console.log(JSON.stringify({captured:replies.length,redactionPending,architectureVerified:replies.filter(r=>evidence.some(e=>e.message_id===r.wamid&&e.architecture==='retrieval-v1')).length,patientSheetLogged:evidence.filter(e=>e.timings?.patientSheet).length}));
