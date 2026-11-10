import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServerComponentClient } from './db/supabase-server';
import { createServerClient } from './db/supabase';
import { t } from './i18n';

export class ScribeWorkspaceError extends Error {
  constructor(public code:string,public status=400){super(code);}
}
export type WorkspaceActor={id:string|null;name:string;role:string;developer:boolean;writer:boolean};
export function isDeveloper(id:string|null){return !!id && !!process.env.SCRIBE_DEVELOPER_USER_ID && id===process.env.SCRIBE_DEVELOPER_USER_ID;}
export function isPracticeProfile(p:{role?:string;patient_id?:string|null}|null):boolean {
  return !!p && !p.patient_id && ['admin','verwaltung','lesezugriff'].includes(p.role??'');
}
export function canWriteScribe(p:{role?:string;patient_id?:string|null;permissions?:{scribe_schreiben?:boolean}|null}|null):boolean {
  return isPracticeProfile(p) && (p?.permissions?.scribe_schreiben ?? ['admin','verwaltung'].includes(p?.role??''));
}
export async function workspaceActor(request?:Request,allowSystem=false):Promise<WorkspaceActor>{
  const token=request?.headers.get('authorization')?.replace(/^Bearer /,'');
  const configured=process.env.SCRIBE_SYSTEM_TOKEN;
  if(allowSystem && configured && token && Buffer.byteLength(token)===Buffer.byteLength(configured) && timingSafeEqual(Buffer.from(token),Buffer.from(configured)))
    return {id:null,name:'System',role:'system',developer:true,writer:false};
  const {data:{user}}=await createServerComponentClient().auth.getUser();
  if(!user)throw new ScribeWorkspaceError('not_authenticated',401);
  const {data:p,error}=await createServerClient().from('user_profiles').select('role,patient_id,permissions,display_name').eq('id',user.id).maybeSingle();
  if(error)throw new ScribeWorkspaceError('profile_unavailable',503);
  if(!p || !isPracticeProfile(p))throw new ScribeWorkspaceError('practice_forbidden',403);
  return {id:user.id,name:p.display_name||'Praxis',role:p.role,developer:isDeveloper(user.id),writer:canWriteScribe(p)};
}
export function requireWriter(a:WorkspaceActor){if(!a.writer)throw new ScribeWorkspaceError('scribe_forbidden',403);}
export function workspaceError(e:unknown){
  const known=e instanceof ScribeWorkspaceError;
  const code=known?e.code:'scribe_workspace_unavailable';
  const key=code==='template_group_protected'?'protected':code==='inbox_developer_required'?'developer':
    code==='inbox_not_ready'?'notReady':known&&e.status===403?'forbidden':known&&e.status===409?'stale':
    known&&e.status===404?'missing':known&&e.status===400?'invalid':'unavailable';
  const message=t(`scribe.workspace.${key}`,'de');
  return NextResponse.json({code,error:message,message},{status:known?e.status:503,headers:{'Cache-Control':'private, no-store'}});
}
export function storageError(error:{message?:string;code?:string}){
  const code=error.message??'';
  const forbidden=['scribe_forbidden','practice_forbidden','template_group_protected','inbox_developer_required','inbox_delete_forbidden'];
  const conflict=['template_revision_stale','inbox_revision_stale','change_superseded','idempotency_conflict','template_layout_changed','history_time_unavailable','inbox_not_ready'];
  if(forbidden.includes(code))throw new ScribeWorkspaceError(code,403);
  if(conflict.includes(code))throw new ScribeWorkspaceError(code,409);
  if(['option_not_found','change_not_found','inbox_not_found'].includes(code))throw new ScribeWorkspaceError(code,404);
  if(['input_invalid','not_practice_option'].includes(code))throw new ScribeWorkspaceError(code,400);
  throw new ScribeWorkspaceError('scribe_workspace_unavailable',503);
}
