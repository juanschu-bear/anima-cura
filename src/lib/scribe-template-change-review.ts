import {createHash} from 'node:crypto';
import type {TemplateSlot,TemplateStateChange} from './scribe-template-history';
import {slotsAt} from './scribe-template-history';

type Rule={code?:unknown;text?:unknown;if?:{g?:unknown;i?:unknown}};
type Template={id:string;struktur:{groups:Record<string,{explizit?:boolean}>};positionen:Rule[]};
type Request={action:string;optionKey?:string;group?:string;text?:string;changeId?:string;at?:string;confirmationFingerprint?:string;confirmProtected?:boolean};
export type TemplateChangeImpact={
 optionKey:string;group:string;previous:{text:string;hidden:boolean};proposed:{text:string;hidden:boolean};
 positions:Array<{ruleIndex:number;code:string|null;text:string|null;optionIndex:number|null}>;
};
export type TemplateChangeReview={
 impacts:TemplateChangeImpact[];requiresConfirmation:boolean;fingerprint:string;
 impossible:null|{code:'template_last_required_option';suggestion:{kind:'rename_instead';optionKey:string;currentText:string}};
};

const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const protectedGroup=(template:Template,group:string)=>!!template.struktur.groups[group]?.explizit||template.positionen.some(rule=>rule.if?.g===group);
const positions=(template:Template,group:string)=>template.positionen.flatMap((rule,index)=>rule.if?.g===group?[{
 ruleIndex:index,code:typeof rule.code==='string'?rule.code:null,text:typeof rule.text==='string'?rule.text:null,
 optionIndex:Number.isInteger(rule.if?.i)?Number(rule.if?.i):null,
}]:[]);

/** Calculates the exact second-confirmation payload without changing a slot. */
export function reviewTemplateChange(template:Template,slots:TemplateSlot[],request:Request,changes:TemplateStateChange[]=[]):TemplateChangeReview{
 const current=slots.filter(slot=>slot.template_id===template.id);
 let targets=current.filter(slot=>slot.option_key===request.optionKey);
 let desiredAt:TemplateSlot[]|null=null;
 if(request.action==='restore_at'&&request.at){desiredAt=slotsAt(current,changes,request.at);targets=current;}
 if(request.action==='undo'&&request.changeId){
  const event=changes.find(change=>change.id===request.changeId) as (TemplateStateChange&{before_state?:{text:string;hidden:boolean}})|undefined;
  targets=event?current.filter(slot=>slot.option_key===event.option_key):[];
 }
 if(request.action==='add'){
  const group=request.group??'';const optionKey=`new:${group}`;
  const impact:TemplateChangeImpact={optionKey,group,previous:{text:'',hidden:true},proposed:{text:(request.text??'').trim(),hidden:false},positions:positions(template,group)};
  const impacts=protectedGroup(template,group)?[impact]:[];
  return {impacts,requiresConfirmation:impacts.length>0,fingerprint:fingerprint(impacts),impossible:null};
 }
 const impacts:TemplateChangeImpact[]=[];let impossible:TemplateChangeReview['impossible']=null;
 for(const slot of targets){
  let proposed={...slot.state};
  if(request.action==='rename')proposed.text=(request.text??'').trim();
  if(request.action==='hide')proposed.hidden=true;
  if(request.action==='show'||request.action==='restore_practice')proposed.hidden=false;
  if(request.action==='restore_at')proposed=desiredAt?.find(value=>value.option_key===slot.option_key)?.state??slot.state;
  if(request.action==='undo'){
   const event=changes.find(change=>change.id===request.changeId) as (TemplateStateChange&{before_state?:{text:string;hidden:boolean}})|undefined;
   if(event?.before_state)proposed=event.before_state;
  }
  const changed=proposed.text!==slot.state.text||proposed.hidden!==slot.state.hidden;
  if(!changed)continue;
  if(proposed.hidden&&template.struktur.groups[slot.gruppe]?.explizit){
   const otherVisible=current.filter(value=>value.gruppe===slot.gruppe&&value.option_key!==slot.option_key&&!value.state.hidden).length;
   if(otherVisible===0)impossible={code:'template_last_required_option',suggestion:{kind:'rename_instead',optionKey:slot.option_key,currentText:slot.state.text}};
  }
  if(protectedGroup(template,slot.gruppe))impacts.push({optionKey:slot.option_key,group:slot.gruppe,previous:slot.state,proposed,positions:positions(template,slot.gruppe)});
 }
 return {impacts,requiresConfirmation:impacts.length>0,fingerprint:fingerprint(impacts),impossible};
}
