import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@/lib/db/supabase';
import {processLearning,learningFailureCode} from '@/lib/services/animahost-learning';
export const dynamic='force-dynamic';
export const maxDuration=300;
/** Operational drain of already accepted sources. Same trusted producer, no patient sending or approval. */
export async function POST(request:NextRequest){
 const secret=process.env.ANIMAHOST_LINE_SECRET,token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!secret||!token||Buffer.byteLength(secret)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(secret),Buffer.from(token)))return NextResponse.json({code:'not_authorized'},{status:401});
 const tenant=process.env.ANIMAHOST_TENANT_ID;if(!tenant)return NextResponse.json({code:'not_configured'},{status:503});
 try{return NextResponse.json(await processLearning(createServerClient({noStore:true}),tenant));}
 catch(error){return NextResponse.json({code:learningFailureCode('worker',error)},{status:503});}
}
