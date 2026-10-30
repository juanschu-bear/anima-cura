export function scribeEntryTarget(params:{entry?:string;patient?:string}){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 return params.entry&&params.patient&&uuid.test(params.entry)&&uuid.test(params.patient)
  ?`/scribe?${new URLSearchParams({entry:params.entry,patient:params.patient})}`:'/scribe';
}
