import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServerClient} from '@/lib/db/supabase';
import {conversationHistorySchema} from '@/lib/services/animahost-whatsapp-conversation';
import {retrievalAnswer} from '@/lib/services/animahost-retrieval-live';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store'};

/**
 * Probelauf der Antwortkette (Juan, 22.11.2026): Was würde AnimaHost auf diese Nachricht antworten?
 * Liest Akte und Regeln und rechnet die Antwort aus. Speichert nichts, verschickt nichts und legt keinen Fall an.
 * Nur der Leitstand ruft das auf, serverseitig mit dem bestehenden Geheimnis. Zurück kommen die Antwort und Zahlen, keine Akte.
 */
const bodySchema=z.strictObject({
 chatJid:z.string().regex(/^\d{6,20}@(s\.whatsapp\.net|lid)$/),
 phone:z.string().regex(/^[1-9][0-9]{7,14}$/).nullable(),
 text:z.string().max(4000),
 messageType:z.string().max(40).default('text'),hasPriorConversation:z.boolean().optional(),hasPriorReply:z.boolean().optional(),
 history:conversationHistorySchema,
 /** Wann die Nachricht damals kam. Danach richten sich „heute“ und die Zeit, zu der das Team antwortet. */
 at:z.string().datetime({offset:true}).optional(),
 knowledgeMode:z.enum(['approved','draft_preview']).default('approved'),
});

function authorized(header:string|null){
 const secret=process.env.ANIMAHOST_CONTROL_SECRET||'';
 const token=/^Bearer (.+)$/.exec(header||'')?.[1]||'';
 return Boolean(secret&&Buffer.byteLength(secret)===Buffer.byteLength(token)&&timingSafeEqual(Buffer.from(secret),Buffer.from(token)));
}

export async function POST(request:NextRequest){
 if(!authorized(request.headers.get('authorization')))return NextResponse.json({code:'not_authenticated'},{status:401,headers});
 const tenant=process.env.ANIMAHOST_TENANT_ID;
 if(!tenant)return NextResponse.json({code:'animahost_not_configured'},{status:503,headers});
 const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({code:'replay_invalid'},{status:400,headers});
 const input=parsed.data,started=Date.now();
 try{
  const db=createServerClient();
  const settings=await db.from('animahost_whatsapp_settings').select('*').eq('tenant_id',tenant).maybeSingle();
  if(settings.error||!settings.data?.active_rulebook_version)return NextResponse.json({code:'animahost_not_configured'},{status:503,headers});
  const answer=await retrievalAnswer(db,{tenantId:tenant,from:input.chatJid,phone:input.phone,messageId:'replay',text:input.text,
   messageType:input.messageType,receivedAt:input.at??new Date().toISOString(),history:input.history,
   hasPriorConversation:input.hasPriorConversation,hasPriorReply:input.hasPriorReply},settings.data,request.signal,input.knowledgeMode==='draft_preview');
  return NextResponse.json({...answer,result:{...answer.result,ok:Boolean(answer.result.text)&&!answer.result.skipSend,
   reason:answer.result.skipSend?(answer.result.excluded?'sender_excluded':answer.result.rule.startsWith('social:')?'silent':'rejected'):null,
   asksIdentity:answer.result.identityQuestion,attempts:answer.result.repairs+1},architecture:'retrieval-v1',model:settings.data.model,
   knowledgeMode:input.knowledgeMode,ms:Date.now()-started},{headers});
 }catch{return NextResponse.json({code:'replay_unavailable'},{status:503,headers});}
}
