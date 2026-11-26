import {z} from 'zod';
import {effektiveStufe} from './permissions';
import {appAccessCommand} from './services/practice-app-access-domain';
import {readAppAccess,sendAppAccess} from './services/practice-app-access';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export function practiceAppAccessHandler(session:()=>any,admin:()=>any){return async(request:Request)=>{
 const fail=(code:string,status:number)=>Response.json({code},{status,headers});
 try{
  const sc=session(),auth=await sc.auth.getUser();if(auth.error||!auth.data.user)return fail('not_authenticated',401);
  const profile=await sc.from('user_profiles').select('role,permissions').eq('id',auth.data.user.id).maybeSingle();
  if(profile.error||!['admin','verwaltung'].includes(profile.data?.role))return fail('forbidden',403);
  const access=effektiveStufe(profile.data.role,profile.data.permissions,'patienten');
  if(access==='keine'||request.method==='POST'&&access!=='schreiben')return fail('forbidden',403);
  if(request.method==='GET'){
   const id=new URL(request.url).searchParams.get('patientId');if(!z.string().uuid().safeParse(id).success)return fail('invalid_patient',400);
   return Response.json(await readAppAccess(admin(),id!),{headers});
  }
  if(request.method!=='POST')return fail('method_not_allowed',405);
  if(request.headers.get('origin')!=='https://animacura.io')return fail('invalid_origin',403);
  const c=appAccessCommand.safeParse(await request.json().catch(()=>null));if(!c.success)return fail('invalid_request',400);
  return Response.json(await sendAppAccess(admin(),auth.data.user.id,c.data),{headers});
 }catch(e){const code=e instanceof Error?e.message:'';return fail(['patient_not_found','recipient_changed','request_conflict'].includes(code)?code:'source_unavailable',code==='patient_not_found'?404:['recipient_changed','request_conflict'].includes(code)?409:503);}
};}
