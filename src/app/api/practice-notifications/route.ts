import {t} from "@/lib/i18n";
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServerComponentClient} from '@/lib/db/supabase-server';
import {workspaceActor,workspaceError,ScribeWorkspaceError,storageError} from '@/lib/scribe-workspace-auth';
export const dynamic='force-dynamic';
export async function GET(r:NextRequest){try{
 const actor=await workspaceActor();const db=createServerComponentClient();
 const lang=r.nextUrl.searchParams.get('lang')==='en'?'en':'de';
 const statusKeys:Record<string,string>={bestaetigt:'recorded',untersucht:'looking',fix_in_arbeit:'working',bereitgestellt:'ready',praxis_bestaetigt:'done'};
 const offset=Number(r.nextUrl.searchParams.get('offset')??0);
 if(!Number.isSafeInteger(offset)||offset<0)throw new ScribeWorkspaceError('input_invalid');
 // RLS restricts both notifications and receipts to this user. PostgREST nested
 // reads allow unread filtering/count without pulling all historical messages.
 const q=()=>db.from('practice_notifications').select('*,practice_notification_reads(read_at)',{count:'exact'});
 const [list,unread]=await Promise.all([
  q().order('created_at',{ascending:false}).order('id').range(offset,offset+49),
  db.from('practice_notifications').select('id,practice_notification_reads!left(notification_id)',{count:'exact',head:true}).is('practice_notification_reads',null)]);
 if(list.error)storageError(list.error);if(unread.error)storageError(unread.error);
 return NextResponse.json({notifications:(list.data??[]).map(n=>({id:n.id,kind:n.kind,title:n.kind==='wunsch_status'?t('scribe.bell.status',lang):n.kind==='antwort'?t('scribe.bell.reply',lang):n.title,text:n.kind==='wunsch_status'?t('scribe.inbox.status.'+(statusKeys[n.body]??'recorded'),lang):n.body,link:n.link,createdAt:n.created_at,readAt:n.practice_notification_reads?.[0]?.read_at??null})),unreadCount:unread.count,total:list.count,nextOffset:offset+50<(list.count??0)?offset+50:null,currentUserId:actor.id},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return workspaceError(e);}}
export async function PATCH(r:NextRequest){try{
 await workspaceActor();
 const input=z.discriminatedUnion('action',[z.object({action:z.literal('read'),id:z.string().uuid()}),z.object({action:z.literal('read_all'),createdBefore:z.string().datetime({offset:true}).optional()})]).safeParse(await r.json().catch(()=>null));
 if(!input.success)throw new ScribeWorkspaceError('input_invalid');
 const {data,error}=await createServerComponentClient().rpc('practice_mark_notifications',{p_id:input.data.action==='read'?input.data.id:null,p_before:input.data.action==='read_all'?input.data.createdBefore??new Date().toISOString():new Date().toISOString()});
 if(error){if(error.message==='notification_not_found')throw new ScribeWorkspaceError('notification_not_found',404);storageError(error);}
 return NextResponse.json({ok:true,markedRead:data});
}catch(e){return workspaceError(e);}}
