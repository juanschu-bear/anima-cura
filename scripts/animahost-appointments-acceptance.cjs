// Run with the active rulebook export and model credentials. Uses an in-memory database and no transport.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { NextRequest } = require('next/server');

const scenarios = [
  { name:'Derselbe Termin, 14:30 auf 15:00', steps:[
    { text:'Ich habe Montag um 14:30 einen Termin und kann wegen der Arbeit erst um 15:00 kommen.', rule:'late_arrival:pending', noLink:true },
    { staff:'approved', text:/15:00/ },
  ] },
  { name:'Zehn Minuten später', steps:[
    { text:'Ich komme zehn Minuten später zu meinem Termin.', rule:'late_arrival:accept', noLink:true },
  ] },
  { name:'45 Minuten später zur Erstuntersuchung', steps:[
    { text:'Ich habe am Montag um 14:30 meine Erstuntersuchung für Erwachsene. Ich komme 45 Minuten später.', rule:'late_arrival:rebook', link:true },
  ] },
  { name:'Einwand gegen eine Neubuchung', steps:[
    { text:'Meine Erstuntersuchung für Erwachsene ist Montag um 14:30. Kann ich stattdessen um 15:00 kommen?', rule:'late_arrival:rebook', link:true },
    { text:'Ich will aber nur eine halbe Stunde später kommen, nicht an einem anderen Tag.', rule:'late_arrival:rebook', link:true },
    { text:'Geht es wirklich nicht um 15:00? Bitte prüfen Sie das noch einmal für denselben Termin.', rule:'late_arrival:pending', noLink:true },
    { staff:'declined', text:/neuen Termin/ },
  ] },
  { name:'Schienenkontrolle 40 Minuten später', steps:[
    { text:'Meine Aligner-Schienenkontrolle ist am Dienstag um 14:30. Ich kann erst um 15:10 kommen.', rule:'late_arrival:wait', noLink:true, textCheck:/15:10|40 Minuten/ },
  ] },
  { name:'Absage mit Nachfrage und Neubuchung', steps:[
    { text:'Ich muss meinen Termin am Montag leider absagen.', rulePrefix:'appointment_notice:cancel:', noLink:true, textCheck:/\?/ },
    { text:'Ja, bitte. Ich möchte einen neuen Termin vereinbaren.', rule:'rebook_after_cancel', link:true },
  ] },
  { name:'Attachment, spontan vorbeikommen', steps:[
    { text:'Attachment abgegangen, kann ich spontan vorbeikommen?', rule:'fallback:attachment', noLink:true },
  ] },
];

const fixture=JSON.parse(readFileSync(process.argv[2],'utf8'));
const tenantId=randomUUID(), actorId=randomUUID(), secret=randomUUID();
const settings={...fixture,practice_phone:'0179 5351813',closure_periods:[],
  appointment_tolerance:require('../src/lib/services/animahost-appointment-tolerance.ts').defaultAppointmentTolerance};
const tables={
  animahost_whatsapp_settings:[settings],
  animahost_whatsapp_rulebook_versions:[{tenant_id:tenantId,version:fixture.active_rulebook_version,rules:fixture.rules}],
  animahost_whatsapp_decisions:[],animahost_appointment_cases:[],practice_notifications:[],
};
settings.tenant_id=tenantId;

function from(table){
  const rows=tables[table];
  assert.ok(rows,`Unexpected table ${table}`);
  const predicates=[];
  let update, insert, sorting, count;
  const chain={
    select(){return chain;},eq(key,value){predicates.push(row=>row[key]===value);return chain;},
    gte(key,value){predicates.push(row=>row[key]>=value);return chain;},
    gt(key,value){predicates.push(row=>row[key]>value);return chain;},
    lte(key,value){predicates.push(row=>row[key]<=value);return chain;},
    is(key,value){predicates.push(row=>(row[key]??null)===value);return chain;},
    order(key,options){sorting={key,descending:options?.ascending===false};return chain;},
    limit(value){count=value;return chain;},
    insert(value){insert=value;return chain;},
    update(value){update=value;return chain;},
    async upsert(values){rows.push(...values);return {data:null,error:null};},
    async maybeSingle(){return {data:(await run())[0]??null,error:null};},
    async single(){return chain.maybeSingle();},
    then(onFulfilled,onRejected){return run().then(data=>({data,error:null})).then(onFulfilled,onRejected);},
  };
  async function run(){
    if(insert){
      const row={id:randomUUID(),created_at:new Date().toISOString(),...insert};
      if(table==='animahost_appointment_cases')Object.assign(row,{status:'pending',delivery_state:'none',reminded_at:null,
        decided_at:null,decided_by:null,note:null,finished_at:null});
      rows.push(row);
      return [row];
    }
    const selected=rows.filter(row=>predicates.every(test=>test(row)));
    if(sorting)selected.sort((a,b)=>String(a[sorting.key]).localeCompare(String(b[sorting.key]))*(sorting.descending?-1:1));
    if(update)for(const row of selected)Object.assign(row,update);
    return selected.slice(0,count);
  }
  return chain;
}
const dbModule=require.resolve('../src/lib/db/supabase.ts');
const original=require(dbModule);
require.cache[dbModule].exports={...original,createServerClient:()=>({from})};
Object.assign(process.env,{ANIMAHOST_LINE_SECRET:secret,ANIMAHOST_CONTROL_SECRET:secret,
  ANIMAHOST_TENANT_ID:tenantId,ANIMAHOST_ACCEPTANCE_PASSED:'true'});
const {POST:answer}=require('../src/app/api/animahost/whatsapp/route.ts');
const {POST:control}=require('../src/app/api/animahost/whatsapp/internal/control/route.ts');
const {POST:deliver}=require('../src/app/api/animahost/whatsapp/followups/route.ts');
const request=body=>new NextRequest('https://example.invalid',{
  method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify(body),
});

(async()=>{
  const results=[];
  for(let i=0;i<(process.argv.includes('--timers-only')?0:scenarios.length);i++){
    const scenario=scenarios[i],history=[],turns=[];
    const from=`99900000${i}@s.whatsapp.net`;
    for(let turn=0;turn<scenario.steps.length;turn++){
      const step=scenario.steps[turn];
      const at=new Date(Date.parse('2026-11-22T11:00:00Z')+turn*10_000).toISOString();
      if(step.staff){
        const pending=tables.animahost_appointment_cases.find(row=>row.chat_jid===from&&row.status==='pending');
        if(!pending){turns.push({practice:step.staff,passed:false,error:'Kein offener Fall'});continue;}
        const reply=await control(request({action:'decide_appointment_case',caseId:pending.id,
          decision:step.staff,actorId,note:'Interne Testnotiz'}));
        const status=await reply.json();
        const claimed=await deliver(request({kind:'appointment',action:'claim',tenantId}));
        const {job}=await claimed.json();
        const once=(await (await deliver(request({kind:'appointment',action:'claim',tenantId}))).json()).job===null;
        if(job)await deliver(request({kind:'appointment',action:'finish',id:job.id,state:'sent',providerMessageId:'simuliert',tenantId}));
        turns.push({practice:step.staff,reply:job?.text,passed:reply.ok&&status.appointmentCase?.status===step.staff&&
          job?.chatJid===from&&Boolean(step.text.test(job.text))&&once});
        continue;
      }
      const start=performance.now();
      const response=await answer(request({tenantId,messageId:randomUUID(),from,
        text:step.text,messageType:'text',receivedAt:at,history}));
      const data=await response.json();
      const elapsedMs=Math.round(performance.now()-start);
      const link=Boolean(data.text?.includes('https://'));
      const passed=response.ok&&typeof data.text==='string'&&Boolean(data.text.trim())&&elapsedMs<20_000&&
        (!step.rule||data.rule===step.rule)&&(!step.rulePrefix||data.rule?.startsWith(step.rulePrefix))&&
        (!step.noLink||!link)&&(!step.link||link)&&(!step.textCheck||step.textCheck.test(data.text));
      turns.push({patient:step.text,reply:data.text,rule:data.rule,action:data.action,replyStyle:data.replyStyle,elapsedMs,passed});
      history.push({direction:'incoming',text:step.text,at},{direction:'outgoing',text:data.text??'',at});
    }
    results.push({scenario:scenario.name,passed:turns.every(turn=>turn.passed),turns});
  }
  const {dueAppointmentCases}=require('../src/lib/services/animahost-appointment-cases.ts');
  const scheduled={
    id:randomUUID(),tenant_id:tenantId,chat_jid:'9990000010@s.whatsapp.net',
    language:'de',status:'pending',reminded_at:null,delivery_state:'none',
    reminder_at:'2026-11-23T11:10:00.000Z',fallback_at:'2026-11-23T12:30:00.000Z',
  };
  const timing=[];
  tables.animahost_appointment_cases.push(scheduled);
  await dueAppointmentCases({from},tenantId,settings.practice_phone,new Date('2026-11-23T11:09:59Z'));
  timing.push({check:'9:59 nach Eingang',passed:scheduled.reminded_at===null});
  await dueAppointmentCases({from},tenantId,settings.practice_phone,new Date('2026-11-23T11:10:00Z'));
  await dueAppointmentCases({from},tenantId,settings.practice_phone,new Date('2026-11-23T11:10:01Z'));
  timing.push({check:'Nach 10 Minuten genau eine Erinnerung je Praxisrolle',
    passed:tables.practice_notifications.filter(item=>item.source_key.endsWith(`${scheduled.id}:reminder`)).length===2});
  await dueAppointmentCases({from},tenantId,settings.practice_phone,new Date('2026-11-23T12:29:59Z'));
  timing.push({check:'Eine Sekunde vor der 60-Minuten-Grenze offen',passed:scheduled.status==='pending'});
  await dueAppointmentCases({from},tenantId,settings.practice_phone,new Date('2026-11-23T12:30:00Z'));
  const queued=await deliver(request({kind:'appointment',action:'claim',tenantId}));
  const phoneResponse=await queued.json();
  const phone=phoneResponse.job;
  timing.push({check:'60 Minuten vor dem Termin telefonischer Rückfall',
    reply:phone?.text,responseStatus:queued.status,state:scheduled.status,passed:phone?.id===scheduled.id&&phone.text.includes(settings.practice_phone)&&scheduled.status==='phone_required'});
  console.log(JSON.stringify({rulebook:fixture.active_rulebook_version,results,timing,whatsappSent:0,productionWrites:0},null,2));
  if(results.some(result=>!result.passed)||timing.some(item=>!item.passed))process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
