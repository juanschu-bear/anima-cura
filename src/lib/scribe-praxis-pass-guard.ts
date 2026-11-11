type PassLike={behandlungsart?:unknown;termin_typ?:unknown;optionen_final?:unknown};
type TemplateLike={id:string;behandlungsart:string;termin_typ:string;struktur?:unknown};
export type PraxisPassTemplateConflict={templateId:string;behandlungsart:string;terminTyp:string;code:'template_structure_change_requires_history'};

const texts=(value:unknown):string[]|null=>Array.isArray(value)&&value.every(item=>typeof item==='string')?value:null;

/** Existing seed arrays are immutable because selections and billing rules address them by index. */
export function findPraxisPassTemplateConflicts(passes:PassLike[],templates:TemplateLike[]):PraxisPassTemplateConflict[]{
 const found:PraxisPassTemplateConflict[]=[];
 for(const pass of passes){
  const template=templates.find(row=>row.behandlungsart===pass.behandlungsart&&row.termin_typ===pass.termin_typ);
  if(!template||!pass.optionen_final||typeof pass.optionen_final!=='object')continue;
  const groups=(template.struktur as any)?.groups??{};
  for(const [groupKey,value] of Object.entries(pass.optionen_final as Record<string,unknown>)){
   const proposed=texts(value);if(!proposed||!groups[groupKey])continue;
   const current=Array.isArray(groups[groupKey].opts)?groups[groupKey].opts.map((item:any)=>item?.t):[];
   if(current.length!==proposed.length||current.some((text:unknown,index:number)=>text!==proposed[index])){
    found.push({templateId:template.id,behandlungsart:template.behandlungsart,terminTyp:template.termin_typ,code:'template_structure_change_requires_history'});break;
   }
  }
 }
 return found;
}

export type PraxisPassOptionChange={templateId:string;group:string;action:'rename'|'hide'|'show'|'add';optionKey?:string;text?:string};

/** Reconcile a Praxis-Pass list into stable slots. Existing places are renamed
 * or hidden; additional texts append as practice slots, so indices never move. */
export function planPraxisPassOptionChanges(passes:PassLike[],templates:TemplateLike[],slots:Array<{
 template_id:string;gruppe:string;option_index:number;option_key:string;source:string;state:{text:string;hidden:boolean}
}>):PraxisPassOptionChange[]{
 const changes:PraxisPassOptionChange[]=[];
 for(const pass of passes){
  const template=templates.find(row=>row.behandlungsart===pass.behandlungsart&&row.termin_typ===pass.termin_typ);
  if(!template||!pass.optionen_final||typeof pass.optionen_final!=='object')continue;
  for(const [group,value] of Object.entries(pass.optionen_final as Record<string,unknown>)){
   const proposed=texts(value);if(!proposed)continue;
   const existing=slots.filter(slot=>slot.template_id===template.id&&slot.gruppe===group&&slot.source==='vorlage').sort((a,b)=>a.option_index-b.option_index);
   proposed.forEach((text,index)=>{
    const slot=existing[index];
    if(!slot){changes.push({templateId:template.id,group,action:'add',text});return;}
    if(slot.state.text!==text)changes.push({templateId:template.id,group,action:'rename',optionKey:slot.option_key,text});
    if(slot.state.hidden)changes.push({templateId:template.id,group,action:'show',optionKey:slot.option_key});
   });
   existing.slice(proposed.length).filter(slot=>!slot.state.hidden).forEach(slot=>changes.push({templateId:template.id,group,action:'hide',optionKey:slot.option_key}));
  }
 }
 return changes;
}
