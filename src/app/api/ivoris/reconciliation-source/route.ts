import {timingSafeEqual} from 'node:crypto';
import {fetchIvorisPatientsPage} from '@/lib/api/ivoris-client';
export const runtime='nodejs';export const maxDuration=60;
/** Read-only, narrowly scoped bridge. Relay credentials never leave the server. */
export async function GET(request:Request){
 const expected=process.env.IVORIS_RECONCILIATION_SECRET??'',actual=request.headers.get('authorization')??'';
 if(expected.length<32||Buffer.byteLength(actual)!==Buffer.byteLength('Bearer '+expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from('Bearer '+expected)))return Response.json({code:'not_authorized'},{status:401});
 const page=Number(new URL(request.url).searchParams.get('page')??'0');if(!Number.isInteger(page)||page<0||page>2000)return Response.json({code:'invalid_page'},{status:400});
 try{const raw=await fetchIvorisPatientsPage(page);if(!Array.isArray(raw))throw Error('invalid_source');const patients=raw.map(p=>({Id:p.Id,HumanReadableId:p.HumanReadableId,Firstname:p.Firstname,Lastname:p.Lastname,Birthday:p.Birthday,Email:p.Email,Mobile:p.Mobile,Phone:p.Phone,mandantIndex:p.mandantIndex,Insurant:p.CurrentInsurance?.Insurant??null}));return Response.json({page,asOf:new Date().toISOString(),patients},{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({code:'ivoris_source_unavailable'},{status:503});}
}
