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
