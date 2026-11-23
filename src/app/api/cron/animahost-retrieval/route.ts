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
 try{return NextResponse.json(await syncRetrievalSources(createServerClient(),tenant));}
 catch{return NextResponse.json({code:'retrieval_sync_failed'},{status:503});}
}
