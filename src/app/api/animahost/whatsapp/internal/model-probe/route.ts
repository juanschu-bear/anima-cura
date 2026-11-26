import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {generateText,Output,jsonSchema} from 'ai';
import {animahostLanguageModel} from '@/lib/services/animahost-model-access';
import {createServerClient} from '@/lib/db/supabase';
export const dynamic='force-dynamic';export const maxDuration=90;
const schema=z.strictObject({system:z.string().max(100000),prompt:z.string().max(100000),schema:z.record(z.unknown()).optional(),plainText:z.boolean().optional(),reasoning:z.enum(['none','low']),maxOutputTokens:z.number().int().min(1).max(4000),timeoutMs:z.number().int().min(1000).max(85000)});
/** Operator-only test transport: no live model key, patient lookup, writes, tools or WhatsApp transport. */
export async function POST(request:NextRequest){
 const secret=process.env.ANIMAHOST_LINE_SECRET,token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!secret||!token||Buffer.byteLength(secret)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(secret),Buffer.from(token)))return NextResponse.json({code:'not_authorized'},{status:401});
 const input=schema.safeParse(await request.json().catch(()=>null));if(!input.success)return NextResponse.json({code:'probe_invalid'},{status:400});
 const body=input.data;if(!body.plainText&&!body.schema||JSON.stringify(body.schema??{}).length>30000)return NextResponse.json({code:'probe_invalid'},{status:400});
 const db=createServerClient({noStore:true});const settings=await db.from('animahost_whatsapp_settings').select('model').eq('tenant_id',process.env.ANIMAHOST_TENANT_ID!).single();
 if(settings.error)return NextResponse.json({code:'probe_settings_unavailable'},{status:503});
 try{
  const result=await generateText({model:animahostLanguageModel(settings.data.model,'test'),system:body.system||undefined,prompt:body.prompt,reasoning:body.reasoning,maxOutputTokens:body.maxOutputTokens,maxRetries:1,abortSignal:AbortSignal.any([request.signal,AbortSignal.timeout(body.timeoutMs)]),...(body.plainText?{}:{output:Output.object({schema:jsonSchema(body.schema as never)})})});
  return NextResponse.json({result:body.plainText?result.text:result.output,usage:result.usage,finishReason:result.finishReason},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return NextResponse.json({code:'probe_failed',type:error instanceof Error?error.name:'unknown'},{status:503});}
}
