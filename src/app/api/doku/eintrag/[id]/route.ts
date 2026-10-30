import {NextRequest,NextResponse} from 'next/server';
import {createServerComponentClient} from '@/lib/db/supabase-server';
import {t} from '@/lib/i18n';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:{id:string}}){
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
 const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
 const patient=request.nextUrl.searchParams.get('patient');
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(params.id)||!patient||!uuid.test(patient))return json({error:t('scribe.clarify.invalid')},400);
 const db=createServerComponentClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return json({error:t('scribe.clarify.login')},401);
 const {data:profile}=await db.from('user_profiles').select('role,permissions').eq('id',user.id).single();
 const permissions=(profile?.permissions??{}) as {scribe_schreiben?:boolean};
 if(!(permissions.scribe_schreiben??['admin','verwaltung'].includes(profile?.role??'')))return json({error:t('scribe.clarify.denied')},403);
 // Session/RLS plus exact patient-entry pairing; no worker or synchronisation is started.
 const {data,error}=await db.from('doku_eintraege').select('id,created_at,zimmer_version_id,termin_datum,behandlungsart,termin_typ,status,version,text,zaehne,positionen,ivoris_push_status,ivoris_fehler,ivoris_entry_id,ivoris_error_class,ivoris_retry_count,ivoris_next_retry_at,bestaetigt_am,patient_id,vorlage_id,auswahl,variablen,ausnahme_freitext,patients(id,vorname,nachname,geburtsdatum)').eq('id',params.id).eq('patient_id',patient).neq('status','verworfen').maybeSingle();
 if(error)return json({error:t('scribe.clarify.load')},503);
 if(!data)return json({error:t('scribe.clarify.unavailable')},404);
 let roomName:string|null=null;
 if(data.zimmer_version_id){const room=await db.from('scribe_room_versions').select('name').eq('id',data.zimmer_version_id).maybeSingle();if(room.error)return json({error:t('scribe.room.loadError')},503);roomName=room.data?.name??null;}
 return json({eintrag:{...data,zimmer_name:roomName}});
}
