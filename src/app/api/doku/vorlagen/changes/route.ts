import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServerClient} from '@/lib/db/supabase';
import {workspaceActor,requireWriter,workspaceError,storageError,ScribeWorkspaceError} from '@/lib/scribe-workspace-auth';
import {templateChangeSchema} from '@/lib/scribe-template-history';
import {changeTemplate,historySlots,SCRIBE_PRACTICE} from '@/lib/scribe-template-history-service';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
 requireWriter(await workspaceActor());
 const id=z.string().uuid().parse(req.nextUrl.searchParams.get('templateId'));
 const before=Number(req.nextUrl.searchParams.get('beforeSeq')??Number.MAX_SAFE_INTEGER);
 if(!Number.isSafeInteger(before)||before<1)throw new ScribeWorkspaceError('input_invalid');
 const db=createServerClient();
 const [history,latest,slots]=await Promise.all([
  db.from('scribe_option_changes').select('*').eq('template_id',id).eq('praxis_id',SCRIBE_PRACTICE).lt('seq',before).order('seq',{ascending:false}).limit(101),
  db.from('scribe_option_changes').select('seq').eq('template_id',id).eq('praxis_id',SCRIBE_PRACTICE).order('seq',{ascending:false}).limit(1),historySlots([id])]);
 if(history.error)storageError(history.error);if(latest.error)storageError(latest.error);
 if(slots===null)throw new ScribeWorkspaceError('scribe_workspace_unavailable',503);
 const changes=(history.data??[]).slice(0,100);
 return NextResponse.json({changes,revision:latest.data?.[0]?.seq??0,nextBeforeSeq:(history.data?.length??0)>100?changes[99].seq:null,
  historyAvailableFrom:slots.length?slots.map(s=>s.created_at).sort()[0]:null,
  deletedPracticeOptions:slots.filter(s=>s.source==='praxis'&&s.state.hidden)},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return workspaceError(e instanceof z.ZodError?new ScribeWorkspaceError('input_invalid'):e);}}
export async function POST(req:NextRequest){try{
 const actor=await workspaceActor();requireWriter(actor);
 const p=templateChangeSchema.safeParse(await req.json().catch(()=>null));if(!p.success)throw new ScribeWorkspaceError('input_invalid');
 return NextResponse.json(await changeTemplate(actor.id!,p.data));
}catch(e){return workspaceError(e);}}
