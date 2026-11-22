import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServerClient} from '@/lib/db/supabase';
import {whatsappRulesSchema} from '@/lib/services/animahost-whatsapp';
import {maskBirthDates} from '@/lib/services/animahost-chat-identity';
import {gatewayGenerate,type ModelCall} from '@/lib/services/animahost-chain-model';
import {assignPairs,bundleTopics,describeTopic,voicePairSchema} from '@/lib/services/animahost-practice-voice';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store'};
const STEP_MS=50_000;

/**
 * Schreibmuster der Praxis (Juan, 22.11.2026): frühere Antworten der Praxis einordnen und beschreiben.
 * Liest das Regelwerk und rechnet. Speichert nichts, verschickt nichts und ändert keine Regel.
 * Nur der Leitstand ruft das auf, serverseitig mit dem bestehenden Geheimnis. Die Texte kommen ohne Namen an.
 */
const text=(max:number)=>z.string().trim().min(1).max(max);
const bodySchema=z.discriminatedUnion('mode',[
 z.strictObject({mode:z.literal('assign'),pairs:z.array(voicePairSchema).min(1).max(30)}),
 z.strictObject({mode:z.literal('bundle'),topics:z.array(z.strictObject({name:text(60),count:z.number().int().min(1).max(100000)})).min(1).max(200)}),
 z.strictObject({mode:z.literal('describe'),topic:text(60),ruleId:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).nullable(),
  answers:z.array(text(900)).min(3).max(40),questions:z.array(text(700)).max(12)}),
]);

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
 if(!parsed.success)return NextResponse.json({code:'voice_invalid'},{status:400,headers});
 const input=parsed.data,started=Date.now(),calls:ModelCall[]=[];
 try{
  const db=createServerClient();
  const settings=await db.from('animahost_whatsapp_settings').select('model,active_rulebook_version').eq('tenant_id',tenant).maybeSingle();
  if(settings.error||!settings.data?.active_rulebook_version)return NextResponse.json({code:'animahost_not_configured'},{status:503,headers});
  const version=await db.from('animahost_whatsapp_rulebook_versions').select('rules').eq('tenant_id',tenant).eq('version',settings.data.active_rulebook_version).single();
  const rules=whatsappRulesSchema.safeParse(version.data?.rules);
  if(version.error||!rules.success)return NextResponse.json({code:'rulebook_unavailable'},{status:503,headers});
  const generate=gatewayGenerate(settings.data.model,request.signal,call=>calls.push(call));
  const done=(result:unknown)=>NextResponse.json({result,calls,ms:Date.now()-started},{headers});
  if(input.mode==='assign')return done(await assignPairs(generate,input.pairs.map(pair=>({id:pair.id,frage:maskBirthDates(pair.frage),antwort:maskBirthDates(pair.antwort)})),rules.data,STEP_MS));
  if(input.mode==='bundle')return done(await bundleTopics(generate,input.topics,STEP_MS));
  const rule=input.ruleId?rules.data.find(item=>item.id===input.ruleId)??null:null;
  return done({...await describeTopic(generate,{topic:input.topic,answers:input.answers.map(maskBirthDates),questions:input.questions.map(maskBirthDates),rule},STEP_MS),
   rule:rule?{id:rule.id,topic:rule.topic,action:rule.action,text:rule.patientText}:null});
 }catch{return NextResponse.json({code:'voice_unavailable',calls,ms:Date.now()-started},{status:503,headers});}
}
