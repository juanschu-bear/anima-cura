import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {deliverInboxMail} from '@/lib/scribe-inbox-mail';
import {workspaceError} from '@/lib/scribe-workspace-auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(r:NextRequest){
 const expected=process.env.CRON_SECRET;const token=r.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!expected||!token||Buffer.byteLength(expected)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(expected),Buffer.from(token)))return NextResponse.json({error:'not_authenticated'},{status:401});
 try{return NextResponse.json(await deliverInboxMail());}catch(e){return workspaceError(e);}
}
