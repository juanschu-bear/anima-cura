import {createHash} from 'node:crypto';
import {z} from 'zod';
export const appAccessCommand=z.strictObject({requestId:z.string().uuid(),patientId:z.string().uuid(),recipientKey:z.enum(['patient','policyholder','second_guardian']),expectedEmail:z.string().trim().email(),recipientConfirmed:z.literal(true),language:z.enum(['de','en']).default('de')});
export type AppAccessCommand=z.infer<typeof appAccessCommand>;
export function appRecipients(p:Record<string,any>){
 return ([['patient','email','vorname','nachname'],['policyholder','versicherter_email','versicherter_vorname','versicherter_nachname'],['second_guardian','eb2_email','eb2_vorname','eb2_nachname']] as const).flatMap(([key,email,first,last])=>{
  const address=String(p[email]??'').trim().toLowerCase();return z.string().email().safeParse(address).success?[{key,email:address,name:[p[first],p[last]].filter(Boolean).join(' ')||null,requiresRecipientConfirmation:true}]:[];
 });
}
export const appAccessScope=(patientId:string,email:string,now=Date.now())=>createHash('sha256').update(`${patientId}:${email}:${Math.floor(now/300000)}`).digest('hex');
export function appRequestResult(row:any,now=Date.now()){
 const state=row.state==='processing'&&now-Date.parse(row.created_at)>120000?'outcome_unknown':row.state;
 return {requestId:row.id,state,requestedAt:row.created_at,acceptedAt:state==='accepted'?row.completed_at:null,errorCode:row.error_code??null};
}
export const scopedAccessRedirect=(link:{patient_ids?:string[]|null;next_path?:string|null})=>link.patient_ids?.length&&link.next_path==='/patient/portal'?'/patient/portal':'/patient/portal?section=rechnungen';
