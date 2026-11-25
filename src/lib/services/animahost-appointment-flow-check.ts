/** Observable mistakes only. The model's stylistic appointment-flow critiques cannot veto a correct next step. */
export function appointmentFlowMistakes(text:string,phase:string|undefined,urgent=false){
 if(urgent)return [];
 const linked=/\{doctolib_link\}|https?:\/\/\S*doctolib/i.test(text);
 const accepted=/kein Problem|kommen Sie einfach|komm einfach|bis gleich|(?:das|es) passt|das ist (?:völlig )?in Ordnung|no problem|come on in/i.test(text);
 const wrong=phase==='clarify'&&(linked||accepted)||phase==='within'&&linked;
 return wrong?[{kind:'appointment_flow' as const,quote:text,reason:phase==='clarify'?'Verspätung ist noch unklar: erst Minuten erfragen, keine Zusage und kein Verschiebelink.':'Innerhalb der 15-Minuten-Toleranz keinen Verschiebelink senden.'}]:[];
}
