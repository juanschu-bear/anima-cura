export type DepartureState={busy:boolean;hasPatient:boolean;confirmed:boolean;changed:boolean;hasContent:boolean;demo:boolean};
/** No reset or navigation until persistence succeeds. No clinical text in browser storage. */
export async function protectScribeDeparture(state:DepartureState,saveDraft:()=>Promise<boolean>):Promise<'leave'|'stay'|'confirm_changes'>{
 if(state.busy)return 'stay';
 if(!state.hasPatient||state.demo)return 'leave';
 if(state.confirmed)return state.changed?'confirm_changes':'leave';
 if(!state.hasContent)return 'leave';
 try{return await saveDraft()?'leave':'stay';}catch{return 'stay';}
}
