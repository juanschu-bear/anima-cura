import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServerClient} from '@/lib/db/supabase';
import {requirePraxisUser} from '@/lib/require-praxis';
import {safeRuleText,whatsappRulesSchema} from '@/lib/services/animahost-whatsapp';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const bodySchema=z.object({expectedVersion:z.number().int().positive().nullable(),rules:whatsappRulesSchema}).strict();
const noStore={'Cache-Control':'private, no-store'};

export async function GET(request:NextRequest){
 const actor=await requirePraxisUser(['admin','verwaltung']);
 if('error' in actor)return actor.error;
 const tenant=process.env.ANIMAHOST_TENANT_ID;
 if(!tenant)return NextResponse.json({code:'animahost_not_configured'},{status:503});
 const db=createServerClient();
 const [settings,history]=await Promise.all([
  db.from('animahost_whatsapp_settings').select('active_rulebook_version,model,voice_output_enabled,voice_perception_enabled,doctolib_url,practice_phone,salutation,host_name,introduction,updated_at').eq('tenant_id',tenant).single(),
  db.from('animahost_whatsapp_rulebook_versions').select('version,created_at,created_by,rules').eq('tenant_id',tenant).order('version',{ascending:false}).limit(request.nextUrl.searchParams.get('history')==='1'?50:1),
 ]);
 if(settings.error||history.error)return NextResponse.json({code:'rulebook_unavailable'},{status:503});
 const active=history.data?.find(item=>item.version===settings.data.active_rulebook_version);
 return NextResponse.json({settings:settings.data,activeVersion:settings.data.active_rulebook_version,
  rules:active?.rules||[],versions:request.nextUrl.searchParams.get('history')==='1'?history.data?.map(({version,created_at,created_by})=>({version,createdAt:created_at,createdBy:created_by})):undefined},{headers:noStore});
}

export async function POST(request:NextRequest){
 const actor=await requirePraxisUser(['admin','verwaltung']);
 if('error' in actor)return actor.error;
 if(request.headers.get('origin')!==new URL(request.url).origin)
  return NextResponse.json({code:'invalid_origin'},{status:403});
 const tenant=process.env.ANIMAHOST_TENANT_ID;
 if(!tenant)return NextResponse.json({code:'animahost_not_configured'},{status:503});
 const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success||!parsed.data.rules.every(safeRuleText))
  return NextResponse.json({code:'rulebook_invalid'},{status:422});
 const db=createServerClient();
 const published=await db.rpc('animahost_whatsapp_publish_rules',{p_tenant:tenant,
  p_expected_version:parsed.data.expectedVersion,p_rules:parsed.data.rules,p_actor:actor.userId});
 if(published.error)return NextResponse.json({code:/animahost_rulebook_stale/.test(published.error.message)?'rulebook_stale':'rulebook_unavailable'},
  {status:/animahost_rulebook_stale/.test(published.error.message)?409:503});
 return NextResponse.json({version:published.data,createdBy:actor.userId},{headers:noStore});
}
