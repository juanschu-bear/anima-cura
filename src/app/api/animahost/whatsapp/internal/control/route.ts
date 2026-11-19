import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServerClient} from '@/lib/db/supabase';
import {safeRuleText,whatsappRulesSchema} from '@/lib/services/animahost-whatsapp';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const settingsSchema=z.strictObject({
 model:z.string().regex(/^[a-z0-9][a-z0-9./_-]{0,119}$/).optional(),
 voiceOutputEnabled:z.boolean().optional(),voicePerceptionEnabled:z.boolean().optional(),
 doctolibUrl:z.string().url().startsWith('https://').nullable().optional(),
 practicePhone:z.string().max(40).nullable().optional(),
 salutation:z.enum(['Sie','Du']).optional(),hostName:z.string().trim().min(1).max(80).optional(),
 introduction:z.string().trim().min(1).max(200).optional(),
});
const bodySchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('publish_rules'),actorId:z.string().uuid(),expectedVersion:z.number().int().positive().nullable(),rules:whatsappRulesSchema}),
 z.strictObject({action:z.literal('update_settings'),actorId:z.string().uuid(),settings:settingsSchema}),
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
 if(resource==='settings'){
  const result=await db.from('animahost_whatsapp_settings').select('*').eq('tenant_id',tenant).single();
  return result.error?unavailable():NextResponse.json({settings:result.data},{headers});
 }
 if(resource==='rules'){
  const [settings,history]=await Promise.all([
   db.from('animahost_whatsapp_settings').select('active_rulebook_version,model,voice_output_enabled,voice_perception_enabled,doctolib_url,practice_phone,salutation,host_name,introduction,updated_at').eq('tenant_id',tenant).single(),
   db.from('animahost_whatsapp_rulebook_versions').select('version,created_at,created_by,rules')
    .eq('tenant_id',tenant).order('version',{ascending:false}).limit(request.nextUrl.searchParams.get('history')==='1'?50:1),
  ]);
  if(settings.error||history.error)return unavailable();
  const active=history.data.find(item=>item.version===settings.data.active_rulebook_version);
  return NextResponse.json({settings:settings.data,activeVersion:settings.data.active_rulebook_version,
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
  hostName:'host_name',introduction:'introduction'} as const;
 const values:Record<string,unknown>={updated_at:new Date().toISOString(),updated_by:input.actorId};
 for(const [key,column] of Object.entries(map)){
  const value=input.settings[key as keyof typeof map];
  if(value!==undefined)values[column]=value;
 }
 const saved=await db.from('animahost_whatsapp_settings').update(values)
  .eq('tenant_id',tenant).select('*').single();
 return saved.error?unavailable():NextResponse.json({settings:saved.data},{headers});
}
