import assert from 'node:assert/strict';
import test from 'node:test';
import {NextRequest} from 'next/server';
import {POST} from '@/app/api/animahost/whatsapp/route';
import {socialReply} from '@/lib/services/animahost-conversation-signals';

const tenantId='ce2d2fb0-ff0e-4d22-8087-e06020f39fad';

test('four cases from 23 November are acknowledged without a reply or practice notification',async()=>{
 const secret=process.env.ANIMAHOST_LINE_SECRET;
 const tenant=process.env.ANIMAHOST_TENANT_ID;
 process.env.ANIMAHOST_LINE_SECRET='internal-test';
 process.env.ANIMAHOST_TENANT_ID=tenantId;
 try{
  const cases=[
   ['10:46:14','unsupported',null,'social:unreadable'],
   ['10:56:39','text','Danke','social:acknowledged'],
   ['10:57:08','reaction',null,'social:reaction'],
   ['10:58:14','reaction',null,'social:reaction'],
  ] as const;
  for(const [time,messageType,text,rule] of cases){
   const response=await POST(new NextRequest('https://test.invalid/api/animahost/whatsapp',{
    method:'POST',
    headers:{authorization:'Bearer internal-test','content-type':'application/json'},
    body:JSON.stringify({tenantId,messageId:'test-'+time,from:'123456@s.whatsapp.net',text,messageType,
     receivedAt:`2026-11-23T${time}+01:00`,hasPriorConversation:true,hasPriorReply:true}),
   }));
   assert.equal(response.status,200,time);
   assert.deepEqual(await response.json(),{action:'antworten',rule,text:'',skipSend:true,optOut:false},time);
  }
 }finally{
  if(secret===undefined)delete process.env.ANIMAHOST_LINE_SECRET;
  else process.env.ANIMAHOST_LINE_SECRET=secret;
  if(tenant===undefined)delete process.env.ANIMAHOST_TENANT_ID;
  else process.env.ANIMAHOST_TENANT_ID=tenant;
 }
});

test('first social signal greets once, genuine media and questions keep their existing paths',()=>{
 for(const [messageType,text] of [['sticker',null],['text','👍🏽 🇩🇪 1️⃣']] as const){
  assert.equal(socialReply({messageType,text,hasPriorConversation:false,hasPriorReply:false}),'begruessung-ohne-anliegen');
  assert.equal(socialReply({messageType,text,hasPriorConversation:true,hasPriorReply:true}),'social:acknowledged');
 }
 for(const [messageType,text] of [['image','👍'],['audio',null],['document',null],['text','Danke, aber der Draht piekst.']] as const){
  assert.equal(socialReply({messageType,text,hasPriorConversation:true,hasPriorReply:true}),null);
 }
});
