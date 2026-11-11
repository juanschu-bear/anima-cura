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
