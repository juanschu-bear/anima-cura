import { z } from 'zod';
export const templateChangeSchema=z.object({
 templateId:z.string().uuid(),requestId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),
 action:z.enum(['hide','show','rename','restore_practice','undo','restore_at']),
 optionKey:z.string().min(1).max(300).optional(),text:z.string().trim().min(1).max(400).optional(),
 changeId:z.string().uuid().optional(),at:z.string().datetime({offset:true}).optional(),
}).strict().superRefine((v,c)=>{
 if(['hide','show','rename','restore_practice'].includes(v.action)&&!v.optionKey)c.addIssue({code:'custom',message:'optionKey required'});
 if(v.action==='rename'&&!v.text)c.addIssue({code:'custom',message:'text required'});
 if(v.action==='undo'&&!v.changeId)c.addIssue({code:'custom',message:'changeId required'});
 if(v.action==='restore_at'&&!v.at)c.addIssue({code:'custom',message:'at required'});
});
export type TemplateSlot={option_key:string;template_id:string;gruppe:string;option_index:number;source:'vorlage'|'praxis';practice_option_id:string|null;baseline:{text:string;hidden:boolean};state:{text:string;hidden:boolean};last_change_id:string|null;created_at:string};
type Group={opts:Array<{t:string;on?:boolean;[k:string]:unknown}>;explizit?:boolean;[k:string]:unknown};
export type HistoryTemplate={id:string;struktur:{groups:Record<string,Group>;[k:string]:unknown};positionen:unknown;[k:string]:unknown};
export type TemplateProjectionError={templateId:string;code:'template_layout_changed'};
export type TemplateStateChange={id:string;option_key:string;after_state:{text:string;hidden:boolean};created_at:string;seq:number};
export function protectedGroup(template:HistoryTemplate,group:string):boolean{
 return !!template.struktur.groups[group]?.explizit || (Array.isArray(template.positionen)&&template.positionen.some(r=>r?.if?.g===group));
}
/** Never filter/splice this array: persistent selections and billing rules use its indices. */
export function projectTemplate<T extends HistoryTemplate>(template:T,slots:TemplateSlot[]):T{
 const out=structuredClone(template);
 for(const [key,g] of Object.entries(out.struktur.groups)){
  const selected=slots.filter(s=>s.template_id===out.id&&s.gruppe===key).sort((a,b)=>a.option_index-b.option_index);
  if(selected.filter(s=>s.source==='vorlage').length!==g.opts.length)throw Error('template_layout_changed');
  const seed=structuredClone(g.opts);
  g.opts=[];
  for(const s of selected){
   if(s.option_index!==g.opts.length)throw Error('template_layout_changed');
   if(s.source==='vorlage'&&seed[s.option_index]?.t!==s.baseline.text)throw Error('template_layout_changed');
   const original=s.source==='vorlage'?seed[s.option_index]:{};
   g.opts.push({...original,t:s.state.text,id:s.practice_option_id??undefined,quelle:s.source==='praxis'?'praxis':'seed',
     optionKey:s.option_key,origin:s.source,hidden:s.state.hidden,lastChangeId:s.last_change_id,
     editable:!protectedGroup(out,key),...(s.state.hidden?{on:false}:{})});
  }
 }
 return out;
}

/** A damaged template is quarantined instead of taking every Scribe template down. */
export function projectTemplatesSafely<T extends HistoryTemplate>(templates:T[],slots:TemplateSlot[]):{
 templates:T[];errors:TemplateProjectionError[]
}{
 const projected:T[]=[];const errors:TemplateProjectionError[]=[];
 for(const template of templates){
  try{projected.push(projectTemplate(template,slots));}
  catch(error){
   if(error instanceof Error&&error.message==='template_layout_changed'){
    errors.push({templateId:template.id,code:'template_layout_changed'});continue;
   }
   throw error;
  }
 }
 return {templates:projected,errors};
}

export function slotsAt(slots:TemplateSlot[],changes:TemplateStateChange[],at:string):TemplateSlot[]{
 const timestamp=new Date(at).getTime();if(!Number.isFinite(timestamp))throw Error('history_time_invalid');
 const latest=new Map<string,TemplateStateChange>();
 for(const change of [...changes].sort((a,b)=>a.seq-b.seq))if(new Date(change.created_at).getTime()<=timestamp)latest.set(change.option_key,change);
 const firstBaseline=slots.reduce<number|null>((first,slot)=>first===null||new Date(slot.created_at).getTime()<first?new Date(slot.created_at).getTime():first,null);
 const beforeBook=firstBaseline!==null&&timestamp<firstBaseline;
 return slots.filter(slot=>slot.source==='vorlage'||beforeBook||new Date(slot.created_at).getTime()<=timestamp)
  .map(slot=>{
   const change=latest.get(slot.option_key);
   // Before the ledger existed, a persisted practice selection is stronger
   // evidence than today's hidden flag. Keep its stable index/text available
   // for validation; never infer that it was hidden at confirmation time.
   const baseline=beforeBook&&slot.source==='praxis'?{...slot.baseline,hidden:false}:slot.baseline;
   return {...slot,state:change?.after_state??baseline,last_change_id:change?.id??null};
  });
}
