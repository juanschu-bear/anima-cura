import {anonymizeRetrieval} from './animahost-retrieval-privacy';
import {contentHash,type RetrievalDocument} from './animahost-retrieval';
import {socialReply,silentSocialRule} from './animahost-conversation-signals';
export type ArchiveMessage={id:string;chat_jid:string;message_id:string;message_at:string;from_me:boolean;body:string|null;message_type:string;display_name?:string|null};
/** Contiguous patient messages paired with the next human reply, never with a bot or a later unrelated reply. */
export function historyPairDocuments(messages:ArchiveMessage[],names:string[],automaticIds:Set<string>,humanBefore:string):RetrievalDocument[]{
 const ordered=[...messages].sort((a,b)=>a.chat_jid.localeCompare(b.chat_jid)||a.message_at.localeCompare(b.message_at)||a.message_id.localeCompare(b.message_id));
 const documents:RetrievalDocument[]=[];let pending:ArchiveMessage[]=[];let chat='';
 for(const m of ordered){
  if(chat!==m.chat_jid){chat=m.chat_jid;pending=[];}
  if(m.message_type==='reaction'||!m.body?.trim())continue;
  const social=socialReply({messageType:m.message_type,text:m.body,hasPriorConversation:true,hasPriorReply:true});
  if(social&&silentSocialRule.test(social)){if(m.from_me)pending=[];continue;}
  if(!m.from_me){pending.push(m);continue;}
  if(!pending.length)continue;
  const questions=pending;pending=[];
  if(Date.parse(m.message_at)>=Date.parse(humanBefore)||automaticIds.has(m.message_id)||Date.parse(m.message_at)-Date.parse(questions[0].message_at)>7*86400000)continue;
  const localNames=[...names,m.display_name??''];
  const question=anonymizeRetrieval(questions.map(q=>q.body).join('\n'),localNames);
  const answer=anonymizeRetrieval(m.body,localNames);
  if(question.length<10||answer.length<10)continue;
  const content=`Patientenanliegen: ${question}\nTatsächliche Praxisantwort: ${answer}`.slice(0,11000);
  documents.push({kind:'history',ref:contentHash(questions[0].message_id+'|'+m.message_id),version:1,source_at:m.message_at,title:'Früherer Praxisfall',content,
   payload:{question,answer,factsOnly:true},draft:false,content_hash:contentHash(content),origin_ref:{questionIds:questions.map(q=>q.id),answerId:m.id,chatHash:contentHash(m.chat_jid)}});
 }
 return documents;
}
