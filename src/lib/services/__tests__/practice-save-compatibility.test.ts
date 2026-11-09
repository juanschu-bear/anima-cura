import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {protectScribeDeparture} from '../../scribe-departure';
test('reproduce both production constraints, then accept custom treatment and ordinary transfer without weakening other checks',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`CREATE TABLE doku_eintraege(id int,behandlungsart text CHECK(behandlungsart IN ('aligner','removable','multiband')),status text CHECK(status IN ('entwurf','bestaetigt','verworfen')));
 CREATE TABLE kassen_zahlungen(id int,zahlart text CHECK(zahlart IN ('qr_ueberweisung','girocard','kreditkarte','bar','guthaben')),betrag numeric CHECK(betrag>0));`);
 const custom='custom-11111111-1111-4111-8111-111111111111';
 await assert.rejects(()=>pg.query('INSERT INTO doku_eintraege VALUES(1,$1,$2)',[custom,'bestaetigt']),/doku_eintraege_behandlungsart_check/);
 await assert.rejects(()=>pg.exec("INSERT INTO kassen_zahlungen VALUES(1,'ueberweisung',100)"),/kassen_zahlungen_zahlart_check/);
 await pg.exec(readFileSync('supabase/migrations/077_scribe_custom_types_and_cash_transfer.sql','utf8'));
 for(const art of ['aligner','removable','multiband',custom]){
  await pg.query('INSERT INTO doku_eintraege VALUES(1,$1,$2)',[art,'entwurf']);
  await pg.query('UPDATE doku_eintraege SET status=$1 WHERE behandlungsart=$2',['bestaetigt',art]);
 }
 for(const art of ['qr_ueberweisung','ueberweisung','girocard','kreditkarte','bar','guthaben'])await pg.query('INSERT INTO kassen_zahlungen VALUES(1,$1,100)',[art]);
 await assert.rejects(()=>pg.exec("INSERT INTO doku_eintraege VALUES(1,'not_a_treatment','bestaetigt')"),/behandlungsart_check/);
 await assert.rejects(()=>pg.exec("INSERT INTO kassen_zahlungen VALUES(1,'unknown_rail',100)"),/zahlart_check/);
 await assert.rejects(()=>pg.exec("INSERT INTO kassen_zahlungen VALUES(1,'ueberweisung',0)"),/betrag_check/);
 assert.equal((await pg.query<any>('SELECT count(*)::int AS n FROM doku_eintraege')).rows[0].n,4);
 }finally{await pg.close();}
});
test('patient switch waits for draft save and retains current entry on server or network error',async()=>{
 const state={busy:false,hasPatient:true,confirmed:false,changed:false,hasContent:true,demo:false};
 assert.equal(await protectScribeDeparture(state,async()=>false),'stay');
 assert.equal(await protectScribeDeparture(state,async()=>{throw Error('offline')}),'stay');
 let release!:(v:boolean)=>void;let finished=false;
 const pending=protectScribeDeparture(state,()=>new Promise<boolean>(r=>release=r)).then(r=>{finished=true;return r;});
 await Promise.resolve();assert.equal(finished,false);release(true);assert.equal(await pending,'leave');
 assert.equal(await protectScribeDeparture({...state,confirmed:true,changed:true},async()=>{throw Error('must not create duplicate draft')}),'confirm_changes');
 assert.equal(await protectScribeDeparture({...state,confirmed:true,changed:true,hasContent:false},async()=>true),'confirm_changes');
 assert.equal(await protectScribeDeparture({...state,busy:true},async()=>true),'stay');
});
