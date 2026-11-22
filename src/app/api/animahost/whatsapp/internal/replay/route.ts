import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServerClient} from '@/lib/db/supabase';
import {whatsappRulesSchema} from '@/lib/services/animahost-whatsapp';
import {conversationHistorySchema} from '@/lib/services/animahost-whatsapp-conversation';
import {maskBirthDates,phonePatients} from '@/lib/services/animahost-chat-identity';
import {appointmentLocalDate} from '@/lib/services/animahost-appointment-notices';
import {teamReplyTime} from '@/lib/services/animahost-team-time';
import {loadDossier} from '@/lib/services/animahost-dossier';
import {runChain} from '@/lib/services/animahost-chain';
import {gatewayGenerate,type ModelCall} from '@/lib/services/animahost-chain-model';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store'};

/**
 * Probelauf der Antwortkette (Juan, 22.11.2026): Was würde AnimaHost auf diese Nachricht antworten?
 * Liest Akte und Regeln und rechnet die Antwort aus. Speichert nichts, verschickt nichts und legt keinen Fall an.
 * Nur der Leitstand ruft das auf, serverseitig mit dem bestehenden Geheimnis. Zurück kommen die Antwort und Zahlen, keine Akte.
 */
const bodySchema=z.strictObject({
 chatJid:z.string().regex(/^\d{6,20}@(s\.whatsapp\.net|lid)$/),
 phone:z.string().regex(/^[1-9][0-9]{7,14}$/).nullable(),
 text:z.string().trim().min(1).max(4000),
 history:conversationHistorySchema,
 /** Wann die Nachricht damals kam. Danach richten sich „heute“ und die Zeit, zu der das Team antwortet. */
 at:z.string().datetime({offset:true}).optional(),
});

function authorized(header:string|null){
 const secret=process.env.ANIMAHOST_CONTROL_SECRET||'';
 const token=/^Bearer (.+)$/.exec(header||'')?.[1]||'';
 return Boolean(secret&&Buffer.byteLength(secret)===Buffer.byteLength(token)&&timingSafeEqual(Buffer.from(secret),Buffer.from(token)));
}

export async function POST(request:NextRequest){
 if(!authorized(request.headers.get('authorization')))return NextResponse.json({code:'not_authenticated'},{status:401,headers});
 const tenant=process.env.ANIMAHOST_TENANT_ID;
 if(!tenant)return NextResponse.json({code:'animahost_not_configured'},{status:503,headers});
 const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({code:'replay_invalid'},{status:400,headers});
 const input=parsed.data,started=Date.now();
 try{
  const db=createServerClient();
  const settings=await db.from('animahost_whatsapp_settings').select('*').eq('tenant_id',tenant).maybeSingle();
  if(settings.error||!settings.data?.active_rulebook_version)return NextResponse.json({code:'animahost_not_configured'},{status:503,headers});
  const practice=settings.data;
  const version=await db.from('animahost_whatsapp_rulebook_versions').select('rules').eq('tenant_id',tenant).eq('version',practice.active_rulebook_version).single();
  const rules=whatsappRulesSchema.safeParse(version.data?.rules);
  if(version.error||!rules.success)return NextResponse.json({code:'rulebook_unavailable'},{status:503,headers});
  const patients=input.phone?await phonePatients(db,input.phone).catch(()=>null)??[]:[];
  const confirmed=await db.from('animahost_whatsapp_verified_patients').select('patient_id').eq('tenant_id',tenant).eq('chat_jid',input.chatJid);
  const now=input.at??new Date().toISOString();
  const language:'de'|'en'|'es'=/\b(?:where|when|please|daughter|what|appointment|speak|thank|my)\b/i.test(input.text)?'en':
   /[¿¡]|\b(?:hola|cita|factura|gracias|puedo|mañana)\b/i.test(input.text)?'es':'de';
  const dossier=await loadDossier(db,{patients,verifiedIds:(confirmed.data??[]).map(row=>row.patient_id),today:appointmentLocalDate(now)});
  const calls:ModelCall[]=[];
  const result=await runChain(gatewayGenerate(practice.model,request.signal,call=>calls.push(call)),{
   message:maskBirthDates(input.text),language,informal:false,
   history:input.history.map(item=>({...item,text:maskBirthDates(item.text)})),dossier,rules:rules.data,
   practice:{doctolibUrl:practice.doctolib_url,phone:practice.practice_phone,today:appointmentLocalDate(now),
    teamTime:teamReplyTime(now,practice.team_reply_days,practice.closure_periods,language)},
   baseline:null,budgetMs:45_000});
  return NextResponse.json({result,file:{sender:dossier.sender,patients:dossier.patients.length,confirmed:dossier.patients.filter(patient=>patient.verified).length},
   model:practice.model,calls,ms:Date.now()-started},{headers});
 }catch{return NextResponse.json({code:'replay_unavailable'},{status:503,headers});}
}
