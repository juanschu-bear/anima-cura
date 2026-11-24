// Exactly twenty test inputs; no transport, writes, scoring, or second evaluation.
import nextEnv from '@next/env';import {writeFileSync,readFileSync} from 'node:fs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {createServerClient}=await import('../src/lib/db/supabase');
const {gatewayGenerate}=await import('../src/lib/services/animahost-chain-model');
const {runRetrievalReply}=await import('../src/lib/services/animahost-retrieval-core');
const {localizeInbound}=await import('../src/lib/services/animahost-inbound-language');
const {retrieveSources}=await import('../src/lib/services/animahost-retrieval');
const tenant=process.argv[2];if(!tenant)throw Error('tenant_required');
const db=createServerClient();const settings=await db.from('animahost_whatsapp_settings').select('*').eq('tenant_id',tenant).single();if(settings.error)throw settings.error;const practice=settings.data;
const rules=await db.from('animahost_whatsapp_rulebook_versions').select('rules').eq('tenant_id',tenant).eq('version',practice.active_rulebook_version).single();if(rules.error)throw rules.error;
const cases=[
 ['Draht','Bei meiner Tochter ist schon wieder ein Draht abgebrochen. Können wir Donnerstag kommen?','parent'],
 ['Attachment','Mir ist ein Attachment abgegangen. Kann ich spontan vorbeikommen?','patient'],
 ['Kunststoff','Kunststoff an der Spange ist ab und es tut weh. Mein Termin ist erst im Dezember.','patient'],
 ['Rechnung in App','Ich sehe die Oktober-Rechnung in der App nicht. Wo finde ich sie?','parent'],
 ['Doctolib','Die Doctolib-Bestätigung fehlt. Klappt Montag 15 Uhr trotzdem?','parent'],
 ['Huhu','Huhu','patient'],
 ['Link','https://example.invalid/abc','patient'],
 ['Russisch','Здравствуйте, у меня отклеился брекет. Можно прийти завтра?','patient'],
 ['Bestätigung','Ich komme Mittwoch 14:15.','patient'],
 ['Tür','Ich stehe vor der Tür, bitte aufmachen!','patient'],
 ['Schmerzen','Ich habe starke Schmerzen und Fieber, die Wange ist geschwollen.','patient'],
 ['Verspätung','Ich komme fünf Minuten später.','patient'],
 ['Unbestätigte Rechnung','Wie viel muss ich noch bezahlen?','unconfirmed'],
 ['Bezahlt','Ich habe gestern überwiesen. Ist die Rechnung damit bezahlt?','patient'],
 ['Zweite Nachfrage','12345','patient'],
 ['Danke','Danke!','patient'],
 ['Korrektur','Hätte*','patient'],
 ['Menschlicher Gesprächsfaden','Ich komme Mittwoch 14:15.','human'],
 ['Abschlussrechnungen','Hallo, ich bräuchte die Abschlussrechnungen von mir und meiner Schwester für die Rückerstattung der Versicherung. Muss ich sie abholen oder geht das über Anima Cura?','unconfirmed'],
 ['Bestätigung aus Live-Chat','Guten Morgen, ich habe bisher über Doctolib noch keine Bestätigung für die Terminänderung bekommen. Geht die Terminverschiebung auf kommenden Montag klar?','parent'],
];
const output:any[]=process.argv.includes('--resume-errors')?JSON.parse(readFileSync('/tmp/animahost-systemtext-20.private.json','utf8')):new Array(cases.length);let next=0;
await Promise.all([0,1].map(async()=>{while(next<cases.length){const index=next++;if(output[index]&&!output[index].error)continue;const [title,message,kind]=cases[index];const at='2026-11-24T10:15:00Z';const calls:any[]=[];const model=gatewayGenerate(practice.model,AbortSignal.timeout(90000),c=>calls.push(c));
 try{
 const localized=await localizeInbound(model,message,15000);
 const docs=await retrieveSources(db,tenant,localized.text,[],false);
 const confirmed=kind!=='unconfirmed';
 const context=confirmed?{schreibendePerson:{rolle:kind==='parent'?'Elternteil':'Patient',patient:'Alex Beispiel',name:kind==='parent'?'Mara Beispiel':null},apparatur:title==='Attachment'?'Aligner':'Feste Spange',behandlungsphase:'Aktive Behandlung',nächsterTermin:{date:/Doctolib|Live/.test(title)?'2026-11-30':'2026-11-26',time:/Doctolib|Live/.test(title)?'15:00':'14:30'},rechnungsakteMitZustellstand:[{monat:'Oktober',freigegeben:false,patientVisible:false,payment:'unbekannt'}],portalzugang:true,bisherigeAnliegen:{hinweis:'Drahtproblem schon einmal berichtet'}}:{};
 const history=title==='Zweite Nachfrage'?[{direction:'outgoing' as const,at:'2026-11-24T10:00:00Z',text:'Was brauchen Sie?',source:'animahost' as const}]:[];
 const result=await runRetrievalReply(model,{message,messageType:'text',jid:'4915100000000@s.whatsapp.net',phone:null,practicePhone:practice.practice_phone,history,dossier:{sender:'unknown',patients:[]},patientSheet:{access:confirmed?'confirmed':'unconfirmed',asOf:at,context,fields:{}},chatName:{status:'matched',matchedName:'Alex Beispiel',question:null,confirmed},documents:docs.documents,rules:rules.data.rules,teamTime:'heute bis 17 Uhr',today:'2026-11-24',receivedAt:at,doctolibUrl:practice.doctolib_url,hasPriorConversation:true,hasPriorReply:true,identityAsked:false,preview:false,budgetMs:60000,translation:localized.translation,...(kind==='human'?{lastOutbound:{source:'practice' as const,at:'2026-11-24T09:45:00Z'}}:{})});
 output[index]={title,message,source:index>=18?'Anonymisierte Live-Eingänge vom 24.11.':'Systemtext v1 / erfundene Testvariante',context,answer:result.text,skip:result.skipSend===true,reason:result.skipSend?result.rule:null,checks:result.checks};
 }catch(error){output[index]={title,message,source:'Testlauf',answer:null,error:error instanceof Error?error.message:'unknown'};}
 console.log('Fall '+(index+1)+' fertig');
}}));
let report='# Systemtext v1 — 20 Testnachrichten\n\n24.11.2026. Ein Durchlauf durch den produktionsgleichen Kern je Eingang. Keine WhatsApp-Nachricht versendet. Namen und Patientenblatt sind erfundene Testdaten; die letzten beiden Eingänge stammen anonymisiert aus dem Live-Bericht vom 24.11. Es erfolgte nur die zum Kern gehörende Prüfung, keine zusätzliche Bewertung.\n\nModell: '+practice.model+'. Systemtext unverändert aus `2026-11-24-systemtext-v1.md`.\n';
for(const [i,row] of output.entries())report+='\n## '+(i+1)+'. '+row.title+'\n\nQuelle: '+row.source+'\n\nEingang:\n\n> '+row.message.replace(/\n/g,'\n> ')+'\n\nAntwort im Wortlaut:\n\n'+(row.error?'Technisch nicht erzeugt: '+row.error:row.skip?'Keine Antwort. Grund: `'+row.reason+'`.'+(row.checks?.at(-1)?.violations?.length?' '+row.checks.at(-1).violations.join('; '):''):'> '+row.answer.replace(/\n/g,'\n> '))+'\n';
writeFileSync('docs/animahost/2026-11-24-systemtext-v1-20-antworten.md',report);
writeFileSync('/tmp/animahost-systemtext-20.private.json',JSON.stringify(output),{mode:0o600});
if(output.some(r=>r.error))process.exitCode=1;
