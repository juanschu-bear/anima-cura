import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {appointmentInstant,appointmentToleranceSchema,defaultAppointmentTolerance as defaults,lateReply,planLateArrival,recoverLateTimes,statesLaterArrival,type LateIntent} from '../animahost-appointment-tolerance';
import {recentConversation,withinReplyBounds} from '../animahost-whatsapp-conversation';

const ordinary='Unsere regulären Sprechzeiten sind Dienstag bis Donnerstag von 9:00 bis 13:00 Uhr und von 14:00 bis 18:30 Uhr. Montag und Freitag sind wir nur nach gesonderter Vereinbarung für Sie da.';
const source:LateIntent={appointmentDate:'2026-11-24',originalTime:'14:30',arrivalTime:null,delayMinutes:30,appointmentTypeId:null};
const plan=(changes:Partial<LateIntent>,tolerance=defaults,closures:unknown=[])=>
 planLateArrival({...source,...changes},null,tolerance,[],ordinary,closures);

test('applies threshold inclusivity, the three intermediate settings and practice hours',()=>{
 assert.equal(plan({delayMinutes:10}).outcome,'accept');
 assert.equal(plan({delayMinutes:15,appointmentTypeId:'erstuntersuchung-kind'}).outcome,'rebook');
 assert.equal(plan({delayMinutes:15}).outcome,'ask_type');
 assert.equal(plan({delayMinutes:30}).outcome,'pending');
 assert.equal(plan({delayMinutes:30,appointmentTypeId:'anders'},defaults).outcome,'pending'); // Unrecognised ID is not a confirmed type.
 assert.equal(plan({delayMinutes:45,appointmentTypeId:'besprechung'}).outcome,'rebook');
 assert.equal(plan({delayMinutes:40,appointmentTypeId:'aligner-schienenkontrolle'}).outcome,'wait');
 assert.equal(plan({delayMinutes:40,appointmentTypeId:'aligner-schienenkontrolle'},defaults,[
  {from:'2026-11-24',through:'2026-11-24',kind:'closure'},
 ]).outcome,'rebook');
 const adaptable={...defaults,lenientTypes:[],strictTypes:[]};
 const rules=[{id:'kleberetainer',topic:'Reparatur',keywords:['reparatur'],patientText:'Bitte auswählen.',action:'antworten' as const,
  appointmentTypeId:'reparatur',appointmentDescription:'Reparatur eines Retainers'}];
 const between=(value:'with_wait'|'case_by_case'|'not_possible')=>planLateArrival(
  {...source,delayMinutes:20,appointmentTypeId:'reparatur'},null,{...adaptable,between:value},rules,ordinary,[]);
 assert.equal(between('with_wait').outcome,'wait');
 assert.equal(between('case_by_case').outcome,'pending');
 assert.equal(between('not_possible').outcome,'rebook');
 assert.equal(appointmentToleranceSchema.safeParse({...defaults,okUpTo:30}).success,false);
 assert.equal(appointmentToleranceSchema.safeParse({...defaults,lenientTypes:defaults.strictTypes}).success,false);
});

test('keeps two separately justified refusals before handing off the same visit',()=>{
 const initial=plan({appointmentTypeId:'erstuntersuchung-kind'});
 const protest:LateIntent={...source,appointmentDate:null,originalTime:null,delayMinutes:null,
  usesEarlierDetails:true,challengesRefusal:true};
 const second=planLateArrival(protest,initial,defaults,[],ordinary,[]);
 assert.equal(second.outcome,'rebook');
 const third=planLateArrival(protest,second,defaults,[],ordinary,[]);
 assert.equal(third.outcome,'pending');
 assert.equal(third.originalTime,'14:30');
 assert.equal(third.arrivalTime,'15:00');
 const url='https://example.invalid/termin';
 assert.match(lateReply(second,'en',url,null),/https:\/\//);
 assert.doesNotMatch(lateReply(third,'en',url,null),/https:\/\//);
});

test('recovers the same-visit times and uses Berlin for the 60-minute threshold',()=>{
 assert.deepEqual(recoverLateTimes('Montag 14:30, kann erst um 15:00 kommen','2026-11-22'),
  {originalTime:'14:30',arrivalTime:'15:00',appointmentDate:'2026-11-23'});
 assert.equal(appointmentInstant('2026-11-23','14:30').toISOString(),'2026-11-23T13:30:00.000Z');
 assert.equal(appointmentInstant('2026-07-23','14:30').toISOString(),'2026-07-23T12:30:00.000Z');
});

test('an explicit 45-minute arrival delay cannot be classified as a fresh booking',()=>{
 const text='Ich habe am Montag um 14:30 meine Erstuntersuchung für Erwachsene. Ich komme 45 Minuten später.';
 assert.equal(statesLaterArrival(text,recoverLateTimes(text,'2026-11-22')),true);
 assert.equal(statesLaterArrival('Ich brauche einen neuen Termin, die Uhrzeit ist offen.',{}),false);
});

test('history excludes old messages, redacts old access links and blocks novel promises or links',()=>{
 assert.deepEqual(recentConversation([
  {direction:'incoming',text:'Alt',at:'2026-11-12T10:00:00Z'},
  {direction:'outgoing',text:'Link https://example.invalid/secret',at:'2026-11-21T10:00:00Z'},
 ],'2026-11-22T08:00:00Z'),[{direction:'outgoing',text:'Link [Link]',at:'2026-11-21T10:00:00Z'}]);
 assert.equal(withinReplyBounds('Ihr Termin wurde verschoben. Kommen Sie um 15:00 Uhr.','Sie können um 15:00 Uhr kommen.'),false);
 assert.equal(withinReplyBounds('Tipp: https://example.invalid','Das Team prüft.'),false);
 assert.equal(withinReplyBounds('Kommen Sie gern um 15:00 Uhr.','Sie können um 15:00 Uhr kommen.'),true);
});

test('migration rejects another project, protects private cases and enforces one pending case per visit',async()=>{
 const sql=readFileSync('supabase/migrations/096_animahost_appointment_tolerance.sql','utf8');
 const pg=new PGlite();
 try{
  await assert.rejects(pg.exec(sql),/Falsches Projekt/);
  await pg.exec(`create role anon;create role authenticated;create role service_role;
   create table patients(id uuid);
   create table animahost_whatsapp_settings(tenant_id uuid primary key);
   create table animahost_whatsapp_decisions(id uuid);
   create table practice_notifications(id uuid);`);
  await pg.exec(sql);
  const tenant='10000000-0000-4000-8000-000000000000';
  await pg.query('insert into animahost_whatsapp_settings(tenant_id) values ($1)',[tenant]);
  const {rows}=await pg.query<{appointment_tolerance:unknown}>('select appointment_tolerance from animahost_whatsapp_settings');
  assert.deepEqual(rows[0].appointment_tolerance,defaults);
  const insert=`insert into animahost_appointment_cases(tenant_id,message_id,chat_jid,appointment_date,original_time,
   arrival_time,delay_minutes,language,reminder_at,fallback_at) values ($1,$2,'999000009@s.whatsapp.net',
   '2026-11-23','14:30','15:00',30,'de',now(),now()+interval '1 day')`;
  await pg.query(insert,[tenant,'first']);
  await assert.rejects(pg.query(insert,[tenant,'second']),/animahost_open_arrival_case/);
  await pg.exec('set role authenticated');
  await assert.rejects(pg.query('select * from animahost_appointment_cases'),/permission denied/);
  await pg.exec('reset role; set role service_role');
  assert.equal((await pg.query('select * from animahost_appointment_cases')).rows.length,1);
 }finally{await pg.close();}
});
