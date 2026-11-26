import {processLearning} from '@/lib/services/animahost-learning';
import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {createServerClient} from '@/lib/db/supabase';
import {syncRetrievalSources} from '@/lib/services/animahost-retrieval';
export const maxDuration=300;
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET,token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!secret||!token||Buffer.byteLength(secret)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(secret),Buffer.from(token)))
  return NextResponse.json({code:'not_authenticated'},{status:401});
 const tenant=process.env.ANIMAHOST_TENANT_ID;
 if(!tenant)return NextResponse.json({code:'not_configured'},{status:503});
 try{const db=createServerClient();const retrieval=await syncRetrievalSources(db,tenant);let learning;try{learning=await processLearning(db,tenant);}catch{learning={error:'learning_unavailable'};}return NextResponse.json({...retrieval,learning});}
 catch{return NextResponse.json({code:'retrieval_sync_failed'},{status:503});}
}
