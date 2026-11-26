import {learningFailureCode,processLearning} from '@/lib/services/animahost-learning';
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
 const db=createServerClient({noStore:true});
 console.info('animahost_learning_start');
 const [retrieval,learning]=await Promise.allSettled([syncRetrievalSources(db,tenant),processLearning(db,tenant)]);
 const learningResult=learning.status==='fulfilled'?learning.value:{error:learningFailureCode('worker',learning.reason)};
 console.info('animahost_learning_run',learningResult);
 return NextResponse.json({...(retrieval.status==='fulfilled'?retrieval.value:{code:'retrieval_sync_failed'}),learning:learningResult},{status:retrieval.status==='fulfilled'?200:503});
}
