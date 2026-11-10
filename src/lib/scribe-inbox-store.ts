import {createServerClient} from './db/supabase';
import {storageError,ScribeWorkspaceError,type WorkspaceActor} from './scribe-workspace-auth';
export async function readInbox(id?:string):Promise<{entry:any;revision:number}[]|null>{
 const db=createServerClient();let q=db.from('scribe_inbox_entries').select('id,payload,revision').is('deleted_at',null).order('created_at',{ascending:false});
 if(id)q=q.eq('id',id);
 const result=await q.limit(1000);
 if(result.error){if(['42P01','PGRST205'].includes(result.error.code))return null;storageError(result.error);}
 const rows=result.data??[];if(!rows.length)return [];
 const ids=rows.map(r=>r.id);const comments:any[]=[];const events:any[]=[];
 for(const [table,target,order] of [['scribe_inbox_events',events,'ordinal'],['scribe_inbox_comments',comments,'id']] as const){
  for(let from=0;;from+=500){const r=await db.from(table).select('*').in('entry_id',ids).order('entry_id').order(order).range(from,from+499);
   if(r.error)storageError(r.error);target.push(...r.data??[]);if((r.data?.length??0)<500)break;}
 }
 return rows.map(row=>({revision:row.revision,entry:{...row.payload,status_verlauf:events.filter(e=>e.entry_id===row.id).map(e=>e.payload),kommentare:comments.filter(c=>c.entry_id===row.id).map(c=>c.payload).sort((a,b)=>a.erstellt_am.localeCompare(b.erstellt_am))}}));
}
export async function commitInbox(entry:unknown,expected:number,actor:WorkspaceActor,remove=false){
 const {data,error}=await createServerClient().rpc('scribe_inbox_commit',{p_entry:entry,p_expected:expected,p_actor:actor.id,p_developer:actor.developer,p_delete:remove});
 if(error)storageError(error);return data as {revision:number};
}
export function assertInboxStatus(actor:WorkspaceActor,previous:string,next:string){
 if(next===previous)return;
 if(!actor.developer&&next!=='praxis_bestaetigt')throw new ScribeWorkspaceError('inbox_developer_required',403);
 if(next==='praxis_bestaetigt'&&previous!=='bereitgestellt')throw new ScribeWorkspaceError('inbox_not_ready',409);
}
