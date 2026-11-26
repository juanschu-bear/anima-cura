import {matchChatNames,senderDeclaration,type ChatNameContext,type NamePatient} from './animahost-name-match';
export function isMinorAt(birthday:string|null|undefined,at:string){
 if(!birthday||!/^\d{4}-\d{2}-\d{2}$/.test(birthday))return null;
 const now=new Date(at);if(!Number.isFinite(now.getTime()))return null;
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if(birthday>day)return null;
 const age=Number(day.slice(0,4))-Number(birthday.slice(0,4))-(day.slice(5)<birthday.slice(5)?1:0);
 return age<18;
}
/** A linked child's identity establishes the subject, not the person holding the phone. */
export function senderAddress(context:ChatNameContext|undefined,patient:NamePatient|undefined,message:string,history:readonly {direction:string;text:string;at:string}[],at:string){
 const minor=isMinorAt(patient?.geburtsdatum,at);
 if(!patient||!context||context.status!=='matched')return {context,avoidPatientSalutation:false,minor};
 const relative=context.source==='linked_relative'||['parent','recipient','subject'].includes(context.role??'');
 const current=senderDeclaration(message);
 const thirdParty=/(?:mein|unser)(?:e[mnr]?)?\s+(?:Sohn|Tochter|Kind|Enkel|Enkelin)\b/i.test(message);
 const previous=!current&&!thirdParty?history.filter(h=>h.direction==='incoming'&&Date.parse(h.at)<=Date.parse(at)&&Date.parse(at)-Date.parse(h.at)<=86400000).slice(-6).reverse().find(h=>senderDeclaration(h.text)||/(?:mein|unser)(?:e[mnr]?)?\s+(?:Sohn|Tochter|Kind)\b/i.test(h.text)):undefined;
 const declaration=current??(previous?senderDeclaration(previous.text):null);
 const self=Boolean(declaration&&matchChatNames(declaration,[patient]).some(m=>m.role==='patient'))&&!thirdParty;
 if(!relative&&self)return {context:{...context,role:'patient'},avoidPatientSalutation:false,minor};
 if(relative||minor===true&&!self){
  const knownRelative=context.source==='linked_relative'||['parent','recipient'].includes(context.role??'');
  return {context:knownRelative?context:{...context,role:'subject'},avoidPatientSalutation:true,minor};
 }
 return {context,avoidPatientSalutation:false,minor};
}
/** Remove only direct forms of address. References to the child's care remain intact. */
export function removeChildSalutation(text:string,patient:NamePatient,avoid:boolean,knownSenderName?:string){
 if(!avoid)return {text,removed:[] as string[]};
 const escape=(v:string)=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const names=[`${patient.vorname} ${patient.nachname}`,patient.vorname,...patient.vorname.split(/[\s-]+/)].filter(Boolean).sort((a,b)=>b.length-a.length).map(escape).join('|');
 const removed:string[]=[];
 const patterns=[
  new RegExp(`((?:^|[.!?]\\s+)(?:Gern(?:e)?|Alles klar|Danke(?: schön)?|Vielen Dank|Hallo|Guten (?:Tag|Morgen|Abend)))\\s*,?\\s+(?:${names})(?=[!,.:?])`,'giu'),
  new RegExp(`(^|[.!?]\\s+)(?:Liebe[r]?|Hallo|Guten (?:Tag|Morgen|Abend))\\s+(?:Frau|Herr)\\s+${escape(patient.nachname)}(?=[!,.:?])`,'giu'),
  new RegExp(`(^|[.!?]\\s+)(?:Liebe[r]?\\s+)?(?:${names}),\\s*`,'gu'),
 ];
 for(let i=0;i<patterns.length;i++){
  if(i===1&&knownSenderName?.toLocaleLowerCase('de').endsWith(patient.nachname.toLocaleLowerCase('de')))continue;
  text=text.replace(patterns[i],(match,prefix)=>{removed.push(match);return i===0?prefix:i===1?prefix+'Hallo':prefix;});
 }
 const trailing=new RegExp(`,\\s*(?:${names})(?=[!.?](?:\\s|$))`,'giu');
 text=text.replace(trailing,match=>{removed.push(match);return '';});
 return {text,removed};
}
