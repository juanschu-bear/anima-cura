import type {createServerClient} from '@/lib/db/supabase';
import {t} from '@/lib/i18n';
import {appointmentLocalDate} from './animahost-appointment-notices';
import {closurePeriodsSchema} from './animahost-practice-closures';
import {renderWhatsAppRuleText,type WhatsAppDecision} from './animahost-whatsapp';
import {identifyByBirthDate,maskBirthDates,parseBirthDate,patientIsMinor,selectPhonePatient,useDu,
 type ChatContext,type PhonePatient,type SubjectTask} from './animahost-chat-identity';
import {recoverPatientInvoice} from './animahost-invoice-recovery';

type Db=ReturnType<typeof createServerClient>;
export type ChatDetails={patientId:string|null;firstName:string|null;lastName:string|null;invoiceDate:string|null;cause:string};
type Outcome={decision:WhatsAppDecision;details?:ChatDetails};
const portal='https://animacura.io';
const labelMatch=(rule:string,text:string,action:WhatsAppDecision['action']='antworten'):Outcome=>({decision:{action,rule,text}});

export function styleMessage(decision:WhatsAppDecision,patient:PhonePatient|null,input:{
 language:string;receivedAt:string;firstReply:boolean;informal:boolean;teamTime:string;
}){
 if(decision.action==='notfall')return decision;
 const {language,firstReply,informal}=input;
 let message=decision.text;
 const addressed=/^(?:identity:|address:|media:|opt_out|invoice_portal:manual_review)/.test(decision.rule);
 const names=patient?[patient.vorname,patient.nachname].filter(Boolean):[];
 const alreadyNamed=names.some(name=>message.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
 if(patient&&!addressed&&!alreadyNamed){
  const minor=patientIsMinor(patient.geburtsdatum,appointmentLocalDate(input.receivedAt));
  if(minor!==false)message=t(firstReply?'animahost.identity.child':'animahost.identity.child_followup',language,{name:patient.vorname})+' '+message;
  if(minor===false){
   const sex=(patient.geschlecht??'').toLocaleLowerCase();
   const name=/^(?:w|weiblich|female)$/.test(sex)?`Frau ${patient.nachname}`:
    /^(?:m|männlich|maennlich|male)$/.test(sex)?`Herr ${patient.nachname}`:`${patient.vorname} ${patient.nachname}`;
   message=t('animahost.identity.adult',language,{name:language==='de'?name:
    minor===false?`${patient.vorname} ${patient.nachname}`:name})+' '+message;
  }
 }
 if(decision.action==='klaerfall'&&!/^late_arrival:|^fallback:|^invoice_portal:|^quality:/.test(decision.rule)&&
  !message.includes(input.teamTime)){
  message=message.replace(/(?:Unser Team|Das Team|Die Praxis) meldet sich(?: bei Ihnen)?\.?/gi,'').trim();
  message=[message,t('animahost.team.reply',language,{when:input.teamTime})].filter(Boolean).join(' ');
 }
 if(informal&&language==='de')message=useDu(message);
 const visited=new Set<string>();
 message=message.replace(/https:\/\/[^\s]+/g,url=>{if(visited.has(url))return '';visited.add(url);return url;}).replace(/ {2,}/g,' ').trim();
 return {...decision,text:message};
}

function kindOf(text:string):SubjectTask|'portal'|'general' {
 if(/bescheinigung|attendance certificate|proof of attendance|justificante/i.test(text))return 'attendance_certificate';
 if(/^\s*nein.{0,25}abrechnung.{0,45}rechnungen?.{0,45}(?:app|portal)/i.test(text))return 'missing_invoice';
 if(/(?:rechnungen?|invoice|factura).{0,90}(?:benachrichtigung|verfügbar|notification|disponible).{0,90}(?:aber|nicht|kein|but|no)/i.test(text))return 'missing_invoice';
 if(/(?:rechnungen?|invoice|factura).{0,70}(?:fehl|nicht (?:sichtbar|zu sehen|angezeigt|da|find)|noch nicht|can.t see|missing|no aparece)|(?:nicht (?:sichtbar|zu sehen)|seh.{0,35}nicht|find.{0,35}nicht).{0,70}(?:rechnung|invoice|factura)|(?:app|portal).{0,80}(?:rechnung|invoice|factura).{0,90}(?:nicht|fehl)/i.test(text))return 'missing_invoice';
 if(/(?:mahnung|zahlungs(?:erinnerung|aufforderung)|payment reminder|saldo pendiente)/i.test(text)&&!/(?:schon|bereits|already|ya).{0,30}(?:bezahlt|überwies|paid|pag)/i.test(text))return 'financial';
 if(/(?:mahnung|zahlungserinnerung|payment reminder|saldo pendiente).{0,90}(?:versteh|wofür|welche|warum|why|which)|(?:was|wofür|welche|warum|why|which).{0,90}(?:mahnung|zahlungserinnerung|payment reminder)|(?:mein(?:e[snmr]?)?|my|mi)\s+(?:guthaben|saldo|balance)|(?:wie viel|how much|cuánto).{0,55}(?:guthaben|offen|überwies|balance|saldo)/i.test(text))return 'financial';
 if(/wa(?:n{1,2})\b.{0,40}(?:termin|appointment)|(?:termin|appointment).{0,34}(?:wann|uhrzeit|finde ich|wo sehe)|(?:weiß|weiss).{0,35}nicht.{0,30}(?:termin|appointment)|when.{0,32}appointment/i.test(text))return 'appointment';
 if(/(?:portal|app|login).{0,50}(?:zugang|download|herunterlad|anmeld|passwort|profil|install|einloggen)|(?:anmeld|login|download|install|passwort|ohne).{0,50}(?:portal|app)/i.test(text))return 'portal';
 return 'general';
}

export function invoicePortalIntent(text:string){
 if(kindOf(text)==='missing_invoice')return 'missing';
 if(/(?:rechnung|invoice|factura).{0,90}(?:dokumente|documents|documentos)|(?:dokumente|documents|documentos).{0,90}(?:rechnung|invoice|factura)/i.test(text))return 'section';
 return null;
}

const noProgress=/nicht|kein|kann.{0,18}nicht|keine mail|can.t|don.t|no puedo|sigue sin/i;
const cancellation=/absag|stornier|cancel|no (?:puedo|podré) asistir/i;
function coverage(text:string,receivedAt:string){
 const exact=parseBirthDate(text);
 if(exact)return {from:exact,through:exact};
 if(/letzte[rsn]? woche|last week|semana pasada/i.test(text)){
  const today=new Date(`${appointmentLocalDate(receivedAt)}T12:00:00Z`);
  const monday=(today.getUTCDay()+6)%7;
  return {from:new Date(today.getTime()-(monday+7)*86_400_000).toISOString().slice(0,10),
   through:new Date(today.getTime()-(monday+1)*86_400_000).toISOString().slice(0,10)};
 }
 return {from:null,through:null};
}

export function visitReply(input:{text:string;language:string;receivedAt:string;doctolib:string|null;closures:unknown}):Outcome|null{
 const {text,language,receivedAt}=input;
 const book=renderWhatsAppRuleText('{doctolib_link}',input.doctolib);
 const translated=(key:string)=>t(`animahost.quality.${key}`,language,{link:book??''});
 if(/(?:spontan|ohne termin).{0,45}(?:vorbei|kommen)|(?:vorbei|kommen).{0,45}(?:spontan|ohne termin)|attachment.{0,20}(?:ab|locker|gelöst)/i.test(text)){
  const attachment=/attachment/i.test(text);
  const blocks=closurePeriodsSchema.safeParse(input.closures);
  const closed=blocks.success&&blocks.data.some(p=>p.from<=appointmentLocalDate(receivedAt)&&appointmentLocalDate(receivedAt)<=p.through);
  const walk=translated(closed?'walk_closed':'walk');
  return labelMatch(attachment?'quality:attachment':'quality:walk_in',
   [attachment?translated('attachment'):null,walk,book?translated(attachment?'aligner_link':'booking_link'):null].filter(Boolean).join(' '));
 }
 return null;
}

export function selfServiceReply(input:{
text:string;language:string;receivedAt:string;teamTime:string;doctolib:string|null;context:ChatContext;assigned:boolean;
}):Outcome|null{
 const {text,language,receivedAt,context}=input;
 const now=Date.parse(receivedAt);
 const fresh=(at:string)=>now-Date.parse(at)<=7*86_400_000&&Date.parse(at)<=now;
 const requested=kindOf(text);
 const book=renderWhatsAppRuleText('{doctolib_link}',input.doctolib);
 const translated=(key:string)=>t(`animahost.quality.${key}`,language,{link:book??'',portal}).trim();
 const handoff=(rule:string,key:string)=>labelMatch(rule,
  translated(key)+' '+t('animahost.team.reply',language,{when:input.teamTime}),'klaerfall');
 const journey=context.journey&&fresh(context.journey.at)?context.journey:null;
 if(/geht.{0,15}auch ohne|ohne (?:das |ein )?portal|(?:also|auch) ohne\??$|without (?:it|the portal)/i.test(text)&&
  journey?.kind==='portal')return labelMatch('quality:portal_alternative',translated('portal_alternative'));
 if(journey?.kind==='appointment'&&/(?:doctolib|mail|profil|konto|rein)/i.test(text)&&noProgress.test(text)||
   journey?.kind==='portal'&&/(?:portal|login|konto|rein|code)/i.test(text)&&noProgress.test(text)){
  const next=Math.min(journey.step+1,3);
  context.journey={kind:journey.kind,step:next,at:receivedAt};
  if(next===2)return labelMatch(`quality:${journey.kind}:2`,translated(`${journey.kind}_2`));
  return handoff(`quality:${journey.kind}:3`,input.assigned?`${journey.kind}_3`:`${journey.kind}_3_identify`);
 }
 if(requested==='appointment'||requested==='portal'){
  if(journey?.kind===requested&&journey.step>=1){
   const next=Math.min(journey.step+1,3);
   context.journey={kind:requested,step:next,at:receivedAt};
   if(next===2)return labelMatch(`quality:${requested}:2`,translated(`${requested}_2`));
   return handoff(`quality:${requested}:3`,input.assigned?`${requested}_3`:`${requested}_3_identify`);
  }
  context.journey={kind:requested,step:1,at:receivedAt};
  return labelMatch(`quality:${requested}:1`,translated(`${requested}_1`));
 }
 return null;
}

export async function qualityWorkflow(db:Db,input:{
 tenantId:string;from:string;phone:string;receivedAt:string;text:string;language:string;teamTime:string;
 patients:PhonePatient[];patient:PhonePatient|null;context:ChatContext;doctolib:string|null;closures:unknown;onlyInvoiceRouting?:boolean;phoneForPractice?:string|null;
}):Promise<Outcome|null>{
 const {text,language,teamTime,context,patients,patient,receivedAt}=input;
 const message=t('animahost.team.reply',language,{when:teamTime});
 const book=renderWhatsAppRuleText('{doctolib_link}',input.doctolib);
 const translated=(key:string,vars:Record<string,string|number>={})=>t(`animahost.quality.${key}`,language,{link:book??'',portal,when:teamTime,...vars}).trim();
 const handoff=(rule:string,key:string,vars?:Record<string,string|number>)=>labelMatch(rule,translated(key,vars)+' '+message,'klaerfall');
 const waiting=(challenge:NonNullable<ChatContext['challenge']>)=>{
  context.challenge=challenge;
  return labelMatch(`identity:${challenge.kind}`,translated(challenge.patientId?'birthday':'identify',
   challenge.patientId&&patientIsMinor(patient?.geburtsdatum??null,appointmentLocalDate(receivedAt))?{patient:patient?.vorname??''}:{patient:''}));
 };
 const detail=(p:PhonePatient|null,cause:string,date:string|null):ChatDetails=>({patientId:p?.id??null,firstName:p?.vorname??null,
  lastName:p?.nachname??null,invoiceDate:date,cause});
 const repair=async(p:PhonePatient,question:string,verified:boolean)=>{
  const selected=await recoverPatientInvoice(db,p.id,coverage(question,receivedAt));
  if(selected.cause==='manual_review'){
   const alreadyAssigned=patients.some(candidate=>candidate.id===p.id);
   return {...handoff('invoice_portal:manual_review',alreadyAssigned?'invoice_manual_named':'invoice_manual',{patient:p.vorname}),
    details:detail(p,selected.cause,selected.invoiceDate)};
  }
  if(selected.cause==='no_invoice')return {...labelMatch('invoice_portal:no_invoice',translated('invoice_none_named',{patient:p.vorname})),
   details:detail(p,selected.cause,null)};
  const date=verified&&selected.invoiceDate?new Intl.DateTimeFormat(language==='en'?'en-GB':language==='es'?'es-ES':'de-DE',
   {dateStyle:'medium',timeZone:'UTC'}).format(new Date(selected.invoiceDate+'T12:00:00Z')):'';
  return {...labelMatch(`invoice_portal:${selected.cause}`,translated(date?'invoice_ready_date_named':'invoice_ready_named',{date,patient:p.vorname})),
   details:detail(p,selected.cause,selected.invoiceDate)};
 };
 const financial=async(p:PhonePatient, question:string)=>{
  if(/doppelt bezahlt|paid twice/i.test(question))return labelMatch('quality:credit_general',translated('duplicate_payment'));
  if(/mahnung|zahlungserinnerung|payment reminder/i.test(question)){
   const items=await db.from('offene_posten').select('id,rechnung_datum,mahnung_datum').eq('patient_id',p.id)
    .not('mahnung_datum','is',null).order('mahnung_datum',{ascending:false}).limit(2);
   if(!items.error&&items.data.length===1&&items.data[0].rechnung_datum){
    const issued=await db.from('billing_invoices').select('due_date').eq('patient_id',p.id)
     .eq('open_item_id',items.data[0].id).eq('status','issued').maybeSingle();
    const format=(date:string)=>new Intl.DateTimeFormat(language==='en'?'en-GB':language==='es'?'es-ES':'de-DE',
     {dateStyle:'medium',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
    return labelMatch('quality:financial_verified',translated(issued.data?.due_date?'financial_reminder_due':'financial_reminder',
     {date:format(items.data[0].rechnung_datum),due:issued.data?.due_date?format(issued.data.due_date):''}));
   }
  }
  return labelMatch('quality:financial_portal',translated('financial_portal'));
 };
 const now=Date.parse(receivedAt);
 const fresh=(at:string)=>now-Date.parse(at)<=7*86_400_000&&Date.parse(at)<=now;
 const requested=kindOf(text);
 const searchingDocuments=/(?:rechnung|invoice|factura).{0,90}(?:dokumente|documents|documentos)|(?:dokumente|documents|documentos).{0,90}(?:rechnung|invoice|factura)/i.test(text);
 if(input.onlyInvoiceRouting&&requested!=='missing_invoice'&&!searchingDocuments)return null;
 const phone=input.phoneForPractice||'0179 5351813';
 if(/abhol|pick up|recoger/i.test(text)&&/schien|aligner/i.test(text)&&/später|later|tarde/i.test(text)){
  const date=appointmentLocalDate(receivedAt),day=new Date(date+'T12:00:00Z').getUTCDay();
  const blocks=closurePeriodsSchema.safeParse(input.closures);
  if([2,3,4].includes(day)&&blocks.success&&!blocks.data.some(p=>p.from<=date&&date<=p.through))
   return labelMatch('quality:pickup_later',translated('pickup_later'));
 }
 if(/^(?:weiß|weiss)|ich melde mich/i.test(text)&&/(?:wann|zeit)/i.test(text)&&
   context.journey?.kind==='appointment'&&context.journey.step===0)
  return labelMatch('quality:cancel_followup',translated('cancel_followup'));
 if(cancellation.test(text))context.journey={kind:'appointment',step:0,at:receivedAt};
 const question=context.challenge;
 if(question?.attempts&&question.at&&now-Date.parse(question.at)<30*60_000&&question.attempts>=5&&
  (parseBirthDate(text)||requested==='financial'||requested==='missing_invoice'))
  return {...handoff('invoice_portal:manual_review','invoice_manual'),details:detail(null,'identity_review',null)};
 if(question&&fresh(question.at)&&parseBirthDate(text)){
  const verified=await identifyByBirthDate(db,text,patients,question.patientId);
  if(!verified){
   context.challenge={...question,attempts:question.attempts+1,at:receivedAt};
   return {...handoff('invoice_portal:manual_review','invoice_manual'),details:detail(null,'identity_review',null)};
  }
  const saved=await db.from('animahost_whatsapp_verified_patients').upsert({tenant_id:input.tenantId,chat_jid:input.from,
   phone:input.phone,patient_id:verified.id,verified_at:receivedAt},{onConflict:'tenant_id,chat_jid,patient_id'});
  if(saved.error)return handoff('invoice_portal:manual_review','invoice_manual');
  delete context.challenge;
  return question.kind==='missing_invoice'?repair(verified,question.question,true):
   financial(verified,question.question);
 }
 const subjectContext=context.subject;
 const simpleName=patients.length>1&&patient&&text.trim().toLocaleLowerCase()===patient.vorname.trim().toLocaleLowerCase();
 if(subjectContext&&fresh(subjectContext.at)&&simpleName){
  delete context.subject;
  if(subjectContext.kind==='missing_invoice')return repair(patient,subjectContext.question,false);
  if(subjectContext.kind==='financial')return waiting({kind:'financial',patientId:patient.id,question:subjectContext.question,attempts:0,at:receivedAt});
  if(subjectContext.kind==='appointment'&&cancellation.test(subjectContext.question))return labelMatch('appointment_notice:cancel:routine',
   translated(book?'cancel_subject':'cancel_without_link',{patient:patient.vorname}));
 }
 if(patients.length>1&&!patient&&(requested==='missing_invoice'||requested==='financial'||cancellation.test(text))){
  context.subject={kind:requested==='general'?'appointment':requested as SubjectTask,question:maskBirthDates(text),at:receivedAt};
  return labelMatch('identity:which_patient',translated('which_patient',{patients:new Intl.ListFormat(language,{type:'disjunction'}).format(patients.map(p=>p.vorname))}));
 }
 if(searchingDocuments&&requested!=='missing_invoice')return labelMatch('quality:invoice_section',translated('invoice_section'));
 if(requested==='missing_invoice'){
  const corrected=/^\s*nein|missverstanden|ich meinte|not the/i.test(text);
  if(patient){
   const result=await repair(patient,text,false);
   if(searchingDocuments)result.decision.text=translated('invoice_section')+' '+result.decision.text;
   return result;
  }
  const availability=await recoverPatientInvoice(db,null,{from:null,through:null});
  const result=availability.checked?waiting({kind:'missing_invoice',question:maskBirthDates(text),attempts:question?.attempts??0,at:receivedAt}):
   {...handoff('invoice_portal:manual_review','invoice_manual'),details:detail(null,'manual_review',null)};
  const prefix=searchingDocuments?translated('invoice_section'):corrected?translated('correction'):'';
  if(prefix)result.decision.text=prefix+' '+result.decision.text;
  return result;
 }
 if(patient&&/(?:wo|where|dónde).{0,50}(?:rechnung|invoice|factura)/i.test(text))
  return labelMatch('quality:invoice_documents',translated('portal_invoice'));
 if(/(?:spange|schiene|aligner|retainer).{0,55}(?:verlor|verleg|lost|perd)|(?:verlor|verleg|lost|perd).{0,55}(?:spange|schiene|aligner|retainer)/i.test(text))
  return handoff('quality:device_lost',patient?'device_lost':'device_lost_identify');
 if(requested==='financial'){
  if(!patient)return waiting({kind:'financial',question:maskBirthDates(text),attempts:question?.attempts??0,at:receivedAt});
  const verified=await db.from('animahost_whatsapp_verified_patients').select('patient_id')
   .eq('tenant_id',input.tenantId).eq('chat_jid',input.from).eq('phone',input.phone).eq('patient_id',patient.id).maybeSingle();
  if(verified.error||!verified.data)return waiting({kind:'financial',patientId:patient.id,question:maskBirthDates(text),attempts:question?.attempts??0,at:receivedAt});
  return financial(patient,text);
 }
 const visit=visitReply({text,language,receivedAt,doctolib:input.doctolib,closures:input.closures});
 if(visit)return visit;
 if(/\b(?:mensch|menschen|human)\b/i.test(text)&&/(?:sprechen|mit|talk)/i.test(text))return handoff('quality:human','human');
 if(/\b(?:sauer|verärgert|beschwerde|furious|angry)\b/i.test(text))return handoff('quality:complaint','complaint');
 if(/spange.{0,35}(?:drückt|drueckt)|(?:drückt|drueckt).{0,30}spange/i.test(text)&&/früher|kurzfristig/i.test(text))
  return labelMatch('quality:appliance_visit',translated(book?'appliance_earlier':'appliance_no_link',{phone}));
 return selfServiceReply({text,language,receivedAt,teamTime,doctolib:input.doctolib,context,assigned:Boolean(patient)});
}
