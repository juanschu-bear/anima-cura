import {NextRequest,NextResponse} from 'next/server';
import {workspaceActor,workspaceError,ScribeWorkspaceError} from '@/lib/scribe-workspace-auth';
import {deliverInboxMail} from '@/lib/scribe-inbox-mail';
export const dynamic='force-dynamic';
export async function POST(r:NextRequest){try{
 const a=await workspaceActor(r,true);if(!a.developer)throw new ScribeWorkspaceError('inbox_developer_required',403);
 return NextResponse.json(await deliverInboxMail());
}catch(e){return workspaceError(e);}}
