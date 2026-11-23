import {timingSafeEqual} from 'node:crypto';
import {contentHash,upsertRetrievalDocuments} from '@/lib/services/animahost-retrieval';
import {remainingPersonNames} from '@/lib/services/animahost-retrieval-redaction';
import {anonymizeRetrieval} from '@/lib/services/animahost-retrieval-privacy';
import {randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServerClient} from '@/lib/db/supabase';
import {safeRuleText,whatsappRulesSchema} from '@/lib/services/animahost-whatsapp';
import {appointmentToleranceSchema,defaultAppointmentTolerance} from '@/lib/services/animahost-appointment-tolerance';
import {appointmentCaseView,caseColumns,decideAppointmentCase} from '@/lib/services/animahost-appointment-cases';
import {defaultTeamReplyDays,teamReplyDaysSchema} from '@/lib/services/animahost-team-time';
import {closurePeriodsSchema} from '@/lib/services/animahost-practice-closures';
import {normalizeContactPhone,patientHasContactPhone,renderNoticeTemplate,validateNoticeTemplate,
 type ContactPatient} from '@/lib/services/animahost-contact-notices';
import {activeKnowledge,knowledgeDraft,knowledgeRecord} from '@/lib/services/animahost-knowledge';
import {bundledKfoImport} from '@/lib/services/animahost-kfo-import';
import {appointmentLocalDate} from '@/lib/services/animahost-appointment-notices';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store'};
const settingsSchema=z.strictObject({
 model:z.string().regex(/^[a-z0-9][a-z0-9./_-]{0,119}$/).optional(),
 voiceOutputEnabled:z.boolean().optional(),voicePerceptionEnabled:z.boolean().optional(),
 doctolibUrl:z.string().url().startsWith('https://').nullable().optional(),
 practicePhone:z.string().max(40).nullable().optional(),
 salutation:z.enum(['Sie','Du']).optional(),hostName:z.string().trim().min(1).max(80).optional(),
 introduction:z.string().trim().min(1).max(200).optional(),
 closurePeriods:closurePeriodsSchema.optional(),appointmentTolerance:appointmentToleranceSchema.optional(),teamReplyDays:teamReplyDaysSchema.optional(),
});
const bodySchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('decide_chat_identity'),actorId:z.string().uuid(),linkId:z.string().uuid(),confirm:z.boolean()}),
 z.strictObject({action:z.literal('publish_rules'),actorId:z.string().uuid(),expectedVersion:z.number().int().positive().nullable(),rules:whatsappRulesSchema}),
 z.strictObject({action:z.literal('update_settings'),actorId:z.string().uuid(),settings:settingsSchema}),
 z.strictObject({action:z.literal('decide_appointment_case'),actorId:z.string().uuid(),caseId:z.string().uuid(),
  decision:z.enum(['approved','declined']),note:z.string().trim().max(280).nullable().optional()}),
 z.strictObject({action:z.literal('verify_patients'),phoneNumber:z.string().max(40),
  patientIds:z.array(z.string().uuid()).min(1).max(10),
  manualReason:z.string().trim().min(10).max(300).nullable()}),
 z.strictObject({action:z.literal('publish_template'),actorId:z.string().uuid(),
  templateId:z.string().uuid().nullable(),expectedVersion:z.number().int().positive().nullable(),
  kind:z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),title:z.string().trim().min(1).max(120),
  bodyTemplate:z.string().trim().min(1).max(1200),active:z.boolean()}),
 z.strictObject({action:z.literal('preview_template'),patientId:z.string().uuid(),
  templateId:z.string().uuid(),version:z.number().int().positive(),
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable()}),
 z.strictObject({action:z.literal('save_knowledge_draft'),actorId:z.string().uuid(),id:z.string().uuid().nullable(),
  expectedVersion:z.number().int().min(0),entry:knowledgeDraft}),
 z.strictObject({action:z.literal('approve_knowledge'),actorId:z.string().uuid(),id:z.string().uuid(),expectedVersion:z.number().int().positive()}),
 z.strictObject({action:z.literal('deactivate_knowledge'),actorId:z.string().uuid(),id:z.string().uuid(),expectedVersion:z.number().int().positive()}),
 z.strictObject({action:z.literal('import_kfo_knowledge'),actorId:z.string().uuid()}),
 z.strictObject({action:z.literal('mark_gold_example'),actorId:z.string().uuid(),sourceRef:z.string().min(1).max(200),
  sourceAt:z.string().datetime({offset:true}),question:z.string().trim().min(1).max(4000),answer:z.string().trim().min(1).max(2000),context:z.string().max(1000).default('')}),

]);

function authorized(header:string|null){
 const secret=process.env.ANIMAHOST_CONTROL_SECRET||'';
 const token=/^Bearer (.+)$/.exec(header||'')?.[1]||'';
 return Boolean(secret&&Buffer.byteLength(secret)===Buffer.byteLength(token)&&
  timingSafeEqual(Buffer.from(secret),Buffer.from(token)));
}
function unavailable(){return NextResponse.json({code:'animahost_unavailable'},{status:503,headers});}

export async function GET(request:NextRequest){
 if(!authorized(request.headers.get('authorization')))
  return NextResponse.json({code:'not_authenticated'},{status:401,headers});
 const tenant=process.env.ANIMAHOST_TENANT_ID;
 if(!tenant)return NextResponse.json({code:'animahost_not_configured'},{status:503,headers});
 const db=createServerClient(),resource=request.nextUrl.searchParams.get('resource');
 if(resource==='chat_identity_links'){
  const patient=z.string().uuid().safeParse(request.nextUrl.searchParams.get('patientId'));
  if(!patient.success)return NextResponse.json({code:'patient_invalid'},{status:400,headers});
  const result=await db.from('animahost_chat_identity_links').select('id,chat_jid,phone,matched_name,status,created_at,updated_at,decided_by').eq('tenant_id',tenant).eq('patient_id',patient.data);
  return result.error?unavailable():NextResponse.json({links:result.data},{headers});
 }
 if(resource==='reply_evidence'){
  const messageId=request.nextUrl.searchParams.get('messageId');
  if(!messageId||messageId.length>200)return NextResponse.json({code:'message_invalid'},{status:400,headers});
  const result=await db.from('animahost_reply_evidence').select('architecture,created_at,evidence,timings').eq('tenant_id',tenant).eq('message_id',messageId).maybeSingle();
  if(result.error)return unavailable();
  return NextResponse.json({answerEvidence:result.data},{headers});
 }
 if(resource==='gold_examples'){
  const result=await db.from('animahost_retrieval_documents').select('ref,version,source_at,title,payload,indexed_at,created_by').eq('tenant_id',tenant).eq('kind','gold').eq('active',true).order('source_at',{ascending:false}).limit(500);
  if(result.error)return unavailable();
  return NextResponse.json({examples:result.data},{headers});
 }
 if(resource==='retrieval_document'){
  const search=request.nextUrl.searchParams;
  const key=z.object({kind:z.enum(['gold','knowledge','rule','history']),ref:z.string().min(1).max(200),version:z.coerce.number().int().positive()}).safeParse({kind:search.get('kind'),ref:search.get('ref'),version:search.get('version')});
  if(!key.success)return NextResponse.json({code:'reference_invalid'},{status:400,headers});
  const result=await db.from('animahost_retrieval_documents').select('kind,ref,version,source_at,title,payload,draft').eq('tenant_id',tenant).eq('kind',key.data.kind).eq('ref',key.data.ref).eq('version',key.data.version).maybeSingle();
  if(result.error)return unavailable();
  return NextResponse.json({document:result.data},{headers});
 }
 if(resource==='knowledge_open_questions'){
  const result=await db.rpc('animahost_knowledge_open_questions',{p_tenant:tenant});
  if(['PGRST202','42883'].includes(result.error?.code??''))return NextResponse.json({knowledgeImportAvailable:false,questions:[]},{headers});
  if(result.error)return unavailable();
  return NextResponse.json({knowledgeImportAvailable:true,questions:result.data.map((row:{id:string;external_id:string|null;version:number;area:string;title:string;question:string})=>
   ({id:row.id,externalId:row.external_id,version:row.version,area:row.area,title:row.title,question:row.question}))},{headers});
 }
 if(resource==='knowledge'){
  const search=request.nextUrl.searchParams;
  const id=z.string().uuid().nullable().safeParse(search.get('id'));
  const page=z.coerce.number().int().min(0).max(10_000).safeParse(search.get('page')??0);
  if(!id.success||!page.success)return NextResponse.json({code:'knowledge_filter_invalid'},{status:400,headers});
  const start=page.data*100;
  let query=db.from('animahost_knowledge_versions').select('*').eq('tenant_id',tenant);
  if(id.data)query=query.eq('id',id.data);
  const result=await query.order('id').order('version',{ascending:false}).range(start,start+100);
  if(['42P01','PGRST205'].includes(result.error?.code??''))
   return NextResponse.json({knowledgeAvailable:false,versions:[],effective:[],nextPage:null},{headers});
  if(result.error)return unavailable();
  try{
   const effective=await activeKnowledge(db,tenant,appointmentLocalDate(new Date().toISOString()));
   return NextResponse.json({knowledgeAvailable:effective.available,versions:result.data.slice(0,100).map(knowledgeRecord),
    effective:effective.entries.filter(entry=>!id.data||entry.id===id.data).map(({id,version})=>({id,version})),
    nextPage:result.data.length>100?page.data+1:null},{headers});
  }catch{return unavailable();}
 }
 if(resource==='appointment_cases'){
  const chat=request.nextUrl.searchParams.get('chatJid');
  if(chat&&!/^\d{6,20}@(s\.whatsapp\.net|lid)$/.test(chat))
   return NextResponse.json({code:'chat_invalid'},{status:400,headers});
  let query=db.from('animahost_appointment_cases').select(caseColumns).eq('tenant_id',tenant);
  const list=request.nextUrl.searchParams.get('view')==='chat_list';
  query=chat?query.eq('chat_jid',chat):list?
   query.or(`status.eq.pending,created_at.gte.${new Date(Date.now()-7*86_400_000).toISOString()}`):query.eq('status','pending');
  const result=await query.order('created_at',{ascending:false}).limit(chat?100:500);
  if(result.error?.code==='42P01'||result.error?.code==='PGRST205')
   return NextResponse.json({appointmentCases:[],appointmentCasesAvailable:false},{headers});
  if(result.error)return unavailable();
  return NextResponse.json({appointmentCases:result.data.map(appointmentCaseView),appointmentCasesAvailable:true},{headers});
 }
 if(resource==='case_changes'){
  const id=z.string().uuid().safeParse(request.nextUrl.searchParams.get('patientId'));
  if(!id.success)return NextResponse.json({code:'patient_invalid'},{status:400,headers});
  const [contact,recipient]=await Promise.all([
   db.from('animahost_contact_changes').select('id,state,previous,proposed,created_at,applied_at,confirmed_by')
    .eq('tenant_id',tenant).eq('patient_id',id.data).order('created_at',{ascending:false}).limit(50),
   db.from('billing_invoice_recipient_versions').select('id,state,snapshot,ivoris_mirror_state,created_at,activated_at,expires_at')
    .eq('tenant_id',tenant).eq('patient_id',id.data).order('created_at',{ascending:false}).limit(50),
  ]);
  if(contact.error||recipient.error)return unavailable();
  return NextResponse.json({contactChanges:contact.data,invoiceRecipients:recipient.data},{headers});
 }
 if(resource==='patient_suggestions'){
  const phone=normalizeContactPhone(request.nextUrl.searchParams.get('phone'));
  if(!phone)return NextResponse.json({code:'phone_invalid'},{status:400,headers});
  const matches:ContactPatient[]=[];
  for(let offset=0;offset<10000;offset+=500){
   const page=await db.from('patients')
    .select('id,vorname,nachname,telefon,mobiltelefon,versicherter_telefon,eb2_telefon')
    .range(offset,offset+499);
   if(page.error)return unavailable();
   for(const patient of page.data||[])if(patientHasContactPhone(patient,phone))matches.push(patient);
   if((page.data||[]).length<500)break;
  }
  return NextResponse.json({phoneNumber:phone,patients:matches.map(patient=>({
   patientId:patient.id,firstName:patient.vorname,lastName:patient.nachname,
   displayName:`${patient.nachname}, ${patient.vorname}`}))},{headers});
 }
 if(resource==='templates'){
  const result=await db.from('animahost_whatsapp_notice_template_versions').select('*')
   .eq('tenant_id',tenant).order('created_at',{ascending:false}).limit(1000);
  if(result.error)return unavailable();
  const latest=new Map<string,(typeof result.data)[number]>();
  for(const row of result.data||[]){const prior=latest.get(row.template_id);
   if(!prior||row.version>prior.version)latest.set(row.template_id,row);}
  const shape=(row:(typeof result.data)[number])=>({templateId:row.template_id,version:row.version,
   kind:row.kind,title:row.title,bodyTemplate:row.body_template,active:row.active,
   createdBy:row.created_by,createdAt:row.created_at});
  return NextResponse.json({templates:Array.from(latest.values()).map(shape),
   versions:request.nextUrl.searchParams.get('history')==='1'?(result.data||[]).map(shape):undefined},{headers});
 }
 if(resource==='settings'){
  const result=await db.from('animahost_whatsapp_settings').select('*').eq('tenant_id',tenant).single();
  return result.error?unavailable():NextResponse.json({settings:{...result.data,teamReplyDays:result.data.team_reply_days??defaultTeamReplyDays}},{headers});
 }
 if(resource==='rules'){
  const [settings,history]=await Promise.all([
   db.from('animahost_whatsapp_settings').select('*').eq('tenant_id',tenant).single(),
   db.from('animahost_whatsapp_rulebook_versions').select('version,created_at,created_by,rules')
    .eq('tenant_id',tenant).order('version',{ascending:false}).limit(request.nextUrl.searchParams.get('history')==='1'?50:1),
  ]);
  if(settings.error||history.error)return unavailable();
  const active=history.data.find(item=>item.version===settings.data.active_rulebook_version);
  const tolerance=settings.data.appointment_tolerance;
  return NextResponse.json({settings:{...settings.data,closurePeriods:settings.data.closure_periods,teamReplyDays:settings.data.team_reply_days??defaultTeamReplyDays,
   appointmentTolerance:tolerance??defaultAppointmentTolerance,appointmentToleranceAvailable:Boolean(tolerance)},activeVersion:settings.data.active_rulebook_version,
   rules:active?.rules||[],versions:request.nextUrl.searchParams.get('history')==='1'?
    history.data.map(({version,created_at,created_by})=>({version,createdAt:created_at,createdBy:created_by})):undefined},{headers});
 }
 return NextResponse.json({code:'resource_invalid'},{status:400,headers});
}

export async function POST(request:NextRequest){
 if(!authorized(request.headers.get('authorization')))
  return NextResponse.json({code:'not_authenticated'},{status:401,headers});
 const tenant=process.env.ANIMAHOST_TENANT_ID;
 if(!tenant)return NextResponse.json({code:'animahost_not_configured'},{status:503,headers});
 const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({code:'control_invalid'},{status:400,headers});
 const db=createServerClient(),input=parsed.data;
 if(input.action==='decide_chat_identity'){
  const result=await db.rpc('animahost_decide_chat_identity',{p_tenant:tenant,p_link:input.linkId,p_actor:input.actorId,p_confirm:input.confirm});
  return result.error?unavailable():NextResponse.json({ok:true,status:input.confirm?'confirmed':'released'},{headers});
 }
 if(input.action==='mark_gold_example'){
  // Redact locally before creating a searchable record. No raw patient data in embeddings.
  const names:string[]=[];
  for(let offset=0;offset<100000;offset+=1000){
   const page=await db.from('patients').select('vorname,nachname').order('id').range(offset,offset+999);
   if(page.error)return unavailable();
   names.push(...page.data.flatMap(p=>[p.vorname??'',p.nachname??'']));
   if(page.data.length<1000)break;
  }
  const model=await db.from('animahost_whatsapp_settings').select('model').eq('tenant_id',tenant).single();
  if(model.error)return unavailable();
  try{names.push(...await remainingPersonNames([input.question,input.answer,input.context].map(text=>anonymizeRetrieval(text,names)),model.data.model,AbortSignal.timeout(25000)));}
  catch{return NextResponse.json({code:'gold_anonymization_unavailable'},{status:503,headers});}
  const result=await db.rpc('animahost_mark_gold',{p_tenant:tenant,p_actor:input.actorId,p_ref:'practice-'+contentHash(input.sourceRef).slice(0,32),
   p_question:anonymizeRetrieval(input.question,names),p_answer:anonymizeRetrieval(input.answer,names),p_context:anonymizeRetrieval(input.context,names),p_at:input.sourceAt});
  if(result.error)return result.error.code==='42501'?NextResponse.json({code:'gold_actor_forbidden'},{status:403,headers}):unavailable();
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  let indexed=false;
  try{await upsertRetrievalDocuments(db,tenant,[row]);indexed=true;}catch{/* durable pending row; scheduled sync retries */}
  return NextResponse.json({ref:row.ref,version:row.version,sourceAt:row.source_at,indexed,status:indexed?'indexed':'pending'}, {status:indexed?201:202,headers});
 }
 if(input.action==='import_kfo_knowledge'){
  const catalog=bundledKfoImport();
  const result=await db.rpc('animahost_import_knowledge',{p_tenant:tenant,p_actor:input.actorId,p_entries:catalog.entries});
  if(result.error){
   if(['PGRST202','42883'].includes(result.error.code))return NextResponse.json({code:'knowledge_import_not_installed'},{status:503,headers});
   if(result.error.code==='42501')return NextResponse.json({code:'knowledge_actor_forbidden'},{status:403,headers});
   if(result.error.code==='23505')return NextResponse.json({code:'knowledge_import_id_conflict'},{status:409,headers});
   return unavailable();
  }
  return NextResponse.json({...result.data,fileVersion:catalog.fileVersion,fileDate:catalog.fileDate,
   openQuestions:catalog.entries.filter(item=>item.metadata.openQuestion!==null).length},{headers});
 }
 if(input.action==='save_knowledge_draft'||input.action==='approve_knowledge'||input.action==='deactivate_knowledge'){
  const draft=input.action==='save_knowledge_draft';
  if(draft&&((!input.id)!==(input.expectedVersion===0)))
   return NextResponse.json({code:'knowledge_invalid'},{status:400,headers});
  if(draft&&(input.entry.sources!==undefined||input.entry.guidance!==undefined||input.entry.openQuestion!==undefined||
   input.entry.area==='gespraech'||input.entry.source==='offen')){
   const schema=await db.from('animahost_knowledge_versions').select('metadata').eq('tenant_id',tenant).limit(0);
   if(schema.error)return NextResponse.json({code:'knowledge_import_not_installed'},{status:503,headers});
  }
  const operation=draft?'draft':input.action==='approve_knowledge'?'approve':'deactivate';
  const result=await db.rpc('animahost_change_knowledge',{p_tenant:tenant,p_id:input.id??randomUUID(),p_expected:input.expectedVersion,
   p_actor:input.actorId,p_action:operation,p_entry:draft?input.entry:null});
  if(result.error){
   const statuses:Record<string,number>={'40001':409,'42501':403,'P0002':404,'22023':422};
   const status=statuses[result.error.code];
   return status?NextResponse.json({code:result.error.message},{status,headers}):unavailable();
  }
  const version=Array.isArray(result.data)?result.data[0]:result.data;
  if(!version)return unavailable();
  return NextResponse.json({version:knowledgeRecord(version)},{status:draft?201:200,headers});
 }
 if(input.action==='decide_appointment_case'){
  const settings=await db.from('animahost_whatsapp_settings').select('doctolib_url,model').eq('tenant_id',tenant).single();
  if(settings.error)return unavailable();
  try{
   const outcome=await decideAppointmentCase(db,tenant,input,settings.data.doctolib_url);
   return NextResponse.json(outcome,{headers,status:outcome.code==='appointment_case_not_found'?404:
    outcome.code==='appointment_case_closed'?409:200});
  }catch{return unavailable();}
 }
 if(input.action==='verify_patients'){
  const phone=normalizeContactPhone(input.phoneNumber);
  if(!phone)return NextResponse.json({code:'phone_invalid'},{status:400,headers});
  const result=await db.from('patients')
   .select('id,vorname,nachname,telefon,mobiltelefon,versicherter_telefon,eb2_telefon')
   .in('id',input.patientIds);
  if(result.error)return unavailable();
  if(result.data.length!==input.patientIds.length)
   return NextResponse.json({code:'patient_not_found'},{status:404,headers});
  const mismatch=result.data.some(patient=>!patientHasContactPhone(patient,phone));
  if(mismatch&&!input.manualReason)
   return NextResponse.json({code:'patient_phone_mismatch'},{status:409,headers});
  return NextResponse.json({phoneNumber:phone,matchSource:mismatch?'manual':'phone',
   manualReason:mismatch?input.manualReason:null,patients:result.data.map(patient=>({
   patientId:patient.id,firstName:patient.vorname,lastName:patient.nachname,
   displayName:`${patient.nachname}, ${patient.vorname}`}))},{headers});
 }
 if(input.action==='preview_template'){
  const [template,patient]=await Promise.all([
   db.from('animahost_whatsapp_notice_template_versions').select('template_id,version,kind,title,body_template,active')
    .eq('tenant_id',tenant).eq('template_id',input.templateId).eq('version',input.version).maybeSingle(),
   db.from('patients').select('id,vorname,nachname').eq('id',input.patientId).maybeSingle(),
  ]);
  if(template.error||patient.error)return unavailable();
  if(!template.data||!template.data.active||!patient.data)
   return NextResponse.json({code:'template_or_patient_not_found'},{status:404,headers});
  try{return NextResponse.json({templateId:input.templateId,version:input.version,
   kind:template.data.kind,title:template.data.title,patientId:patient.data.id,
   patientName:`${patient.data.nachname}, ${patient.data.vorname}`,
   text:renderNoticeTemplate(template.data.body_template,patient.data,input.date,input.time)},
   {headers});}
  catch(error){return NextResponse.json({code:error instanceof Error?error.message:'template_invalid'},
   {status:422,headers});}
 }
 if(input.action==='publish_template'){
  if(!validateNoticeTemplate(input.bodyTemplate))
   return NextResponse.json({code:'template_invalid'},{status:422,headers});
  const templateId=input.templateId||randomUUID();
  const published=await db.rpc('animahost_publish_notice_template',{p_tenant:tenant,
   p_template:templateId,p_expected:input.expectedVersion,p_kind:input.kind,
   p_title:input.title,p_body:input.bodyTemplate,p_active:input.active,p_actor:input.actorId});
  if(published.error){const stale=published.error.message.includes('notice_template_stale');
   return NextResponse.json({code:stale?'notice_template_stale':'template_unavailable'},
    {status:stale?409:503,headers});}
  return NextResponse.json({templateId,version:published.data,createdBy:input.actorId},{headers});
 }
 if(input.action==='publish_rules'){
  if(!input.rules.every(safeRuleText))return NextResponse.json({code:'rulebook_invalid'},{status:422,headers});
  const published=await db.rpc('animahost_whatsapp_publish_rules',{p_tenant:tenant,
   p_expected_version:input.expectedVersion,p_rules:input.rules,p_actor:input.actorId});
  if(published.error)return NextResponse.json({code:published.error.message.includes('animahost_rulebook_stale')?
   'rulebook_stale':'rulebook_unavailable'},{status:published.error.message.includes('animahost_rulebook_stale')?409:503,headers});
  return NextResponse.json({version:published.data,createdBy:input.actorId},{headers});
 }
 const map={model:'model',voiceOutputEnabled:'voice_output_enabled',voicePerceptionEnabled:'voice_perception_enabled',
  doctolibUrl:'doctolib_url',practicePhone:'practice_phone',salutation:'salutation',
  hostName:'host_name',introduction:'introduction',closurePeriods:'closure_periods',appointmentTolerance:'appointment_tolerance',teamReplyDays:'team_reply_days'} as const;
 const values:Record<string,unknown>={updated_at:new Date().toISOString(),updated_by:input.actorId};
 for(const [key,column] of Object.entries(map)){
  const value=input.settings[key as keyof typeof map];
  if(value!==undefined)values[column]=value;
 }
 const saved=await db.from('animahost_whatsapp_settings').update(values)
  .eq('tenant_id',tenant).select('*').single();
 return saved.error?unavailable():NextResponse.json({settings:{...saved.data,closurePeriods:saved.data.closure_periods,teamReplyDays:saved.data.team_reply_days??defaultTeamReplyDays,
  appointmentTolerance:saved.data.appointment_tolerance??defaultAppointmentTolerance,
  appointmentToleranceAvailable:Boolean(saved.data.appointment_tolerance)}},{headers});
}
