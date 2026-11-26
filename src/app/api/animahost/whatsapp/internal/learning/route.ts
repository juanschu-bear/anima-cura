import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@/lib/db/supabase';
import {learningSource} from '@/lib/services/animahost-learning';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const secret=process.env.ANIMAHOST_LINE_SECRET,token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!secret||!token||Buffer.byteLength(secret)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(secret),Buffer.from(token)))return NextResponse.json({code:'not_authorized'},{status:401});
 const parsed=learningSource.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({code:'learning_invalid'},{status:400});const input=parsed.data;
 if(input.tenantId!==process.env.ANIMAHOST_TENANT_ID)return NextResponse.json({code:'not_authorized'},{status:403});
 if(!input.evidence.some(m=>m.messageId===input.id&&m.source===input.source&&Date.parse(m.at)===Date.parse(input.sourceAt)))return NextResponse.json({code:'learning_target_invalid'},{status:400});
 const db=createServerClient();const result=await db.from('animahost_learning_sources').upsert({tenant_id:input.tenantId,id:input.id,source:input.source,source_at:input.sourceAt,chat_jid:input.chatJid,evidence:input.evidence},{onConflict:'tenant_id,id',ignoreDuplicates:true});
 return result.error?NextResponse.json({code:'learning_store_unavailable'},{status:503}):NextResponse.json({accepted:true,id:input.id},{status:202,headers:{'Cache-Control':'no-store'}});
}
