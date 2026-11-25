import {t} from './i18n';
export const hostBellPrefix='animahost:bell:';
export const validChat=(value:unknown):value is string=>typeof value==='string'&&/^\d{6,20}@(lid|s\.whatsapp\.net)$/.test(value);
export type HostBellItem={id:string;person:string;concern:string;done:string};
export type HostBellBundle={type:'animahost_act_v1';chat:string;startedAt:string;items:HostBellItem[]};
export function hostBellBundle(body:string):HostBellBundle|null{try{const value=JSON.parse(body);return value.type==='animahost_act_v1'&&validChat(value.chat)&&Number.isFinite(Date.parse(value.startedAt))&&Array.isArray(value.items)&&value.items.length&&value.items.every((i:any)=>['id','person','concern','done'].every(k=>typeof i[k]==='string'))?value:null;}catch{return null;}}
export function hostMessagesLink(chat:string){if(!validChat(chat))throw Error('invalid_chat');return 'https://anima-leitstand.vercel.app/?chat='+encodeURIComponent(chat);}
export function hostBellTarget(link:string){try{const url=new URL(link);return url.origin==='https://anima-leitstand.vercel.app'&&url.pathname==='/'&&validChat(url.searchParams.get('chat'))?hostMessagesLink(url.searchParams.get('chat')!):null;}catch{return null;}}
export function hostBellText(bundle:HostBellBundle,lang:'de'|'en'='de'){
 const line=(item:HostBellItem)=>`${item.person}: ${t('animahost.bell.concern.'+item.concern,lang)}, ${t('animahost.bell.done.'+item.done,lang)}`;
 const latest=bundle.items.at(-1)!;
 return {title:line(latest)+(bundle.items.length>1?' · '+t('animahost.bell.more',lang,{n:bundle.items.length-1}):''),text:bundle.items.map(line).join('\n'),link:hostMessagesLink(bundle.chat)};
}
export function practiceNotificationText(n:{kind:string;title:string;body:string;link:string;source_key:string},lang:'de'|'en'){
 const bundle=n.source_key.startsWith(hostBellPrefix)?hostBellBundle(n.body):null;
 if(bundle)return hostBellText(bundle,lang);
 const statusKeys:Record<string,string>={bestaetigt:'recorded',untersucht:'looking',fix_in_arbeit:'working',bereitgestellt:'ready',praxis_bestaetigt:'done'};
 return {title:n.kind==='wunsch_status'?t('scribe.bell.status',lang):n.kind==='antwort'&&!/^animahost[:-]/.test(n.source_key)?t('scribe.bell.reply',lang):n.title,text:n.kind==='wunsch_status'?t('scribe.inbox.status.'+(statusKeys[n.body]??'recorded'),lang):n.body,link:n.link};
}
