import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { reviewService, tariffInput, workspaceCommand, sourceIsCurrent } from '../../billing-workspace';

const actor='00000000-0000-4000-8000-000000000001',patient='00000000-0000-4000-8000-000000000002',entry='00000000-0000-4000-8000-000000000003';
const tariff={sourceReference:'SYNTHETIC TEST ONLY',validFrom:'2026-07-01',validTo:'2026-09-30',schedule:'BEMA',code:'126a',insurerId:'test',requiresRegion:true,price:{kind:'points',points:'10',pointValueEuro:'1.2'}};
const service={patientId:patient,source:{system:'scribe' as const,recordId:entry,version:1,positionIndex:0},serviceDate:'2026-07-05',schedule:'BEMA' as const,code:'126a',description:'Synthetic service',quantity:1,region:'11',factor:null,justification:null,insurerId:'test',tariffVersionId:null as string|null};

test('persistent billing migration: revisions, approvals, permissions, stale sources and idempotency',async t=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE patients(id uuid PRIMARY KEY);
      CREATE TABLE user_profiles(id uuid PRIMARY KEY,role text,permissions jsonb);
      CREATE TABLE doku_eintraege(id uuid PRIMARY KEY,patient_id uuid,version integer,termin_datum date,status text,bestaetigt_am timestamptz,positionen jsonb);
      INSERT INTO patients VALUES ('${patient}');
      INSERT INTO user_profiles VALUES ('${actor}','verwaltung',null);
      INSERT INTO doku_eintraege VALUES ('${entry}','${patient}',1,'2026-07-05','bestaetigt',now(),'[{"code":"BEMA 126a","anzahl":1}]');`);
    await db.exec(await readFile('supabase/migrations/049_billing_versions.sql','utf8'));
    const write=async(input:unknown,requestId=randomUUID())=>{
      const result=await db.query<{id:string}>('SELECT billing_write($1,$2,$3::jsonb) AS id',[actor,requestId,JSON.stringify(input)]);
      return result.rows[0].id;
    };
    const recordId=randomUUID(),requestId=randomUUID();
    const save={action:'save',kind:'tariff',recordId,expectedRevision:0,reason:'Synthetic initial tariff',data:tariff};
    const tariffId=await write(save,requestId);
    await t.test('identical retries return same version; changed payload is rejected',async()=>{
      assert.equal(await write(save,requestId),tariffId);
      await assert.rejects(write({...save,reason:'Changed reason'},requestId),/request_conflict/);
      assert.equal((await db.query('SELECT * FROM billing_versions')).rows.length,1);
    });
    await t.test('no lost update and no client-level direct writes',async()=>{
      await assert.rejects(write(save),/revision_conflict/);
      await db.exec('SET ROLE authenticated');
      await assert.rejects(db.query('SELECT * FROM billing_versions'),/permission denied/);
      await assert.rejects(db.query('SELECT billing_write($1,$2,$3::jsonb)',[actor,randomUUID(),JSON.stringify(save)]),/permission denied/);
      await db.exec('RESET ROLE');
    });
    await write({action:'approve',versionId:tariffId,reason:'Confirmed synthetic source'});
    await t.test('approved content cannot be rewritten or deleted',async()=>{
      await assert.rejects(db.query('UPDATE billing_versions SET data=$1 WHERE id=$2',[{},tariffId]),/immutable/);
      await assert.rejects(db.query('DELETE FROM billing_versions WHERE id=$1',[tariffId]),/immutable/);
    });
    const data={...service,tariffVersionId:tariffId};
    const serviceRecord=randomUUID();
    const serviceId=await write({action:'save',kind:'service',recordId:serviceRecord,expectedRevision:0,reason:'Synthetic position',data});
    await t.test('duplicate source cannot create a second billable logical position',async()=>{
      await assert.rejects(write({action:'save',kind:'service',recordId:randomUUID(),expectedRevision:0,reason:'Duplicate source',data}),/duplicate key/);
    });
    await t.test('wrong totals and stale Scribe revisions block approval',async()=>{
      await assert.rejects(write({action:'approve',versionId:serviceId,reason:'Wrong amount',grossCents:1199}),/amount_mismatch/);
      await db.exec(`UPDATE doku_eintraege SET version=2 WHERE id='${entry}'`);
      await assert.rejects(write({action:'approve',versionId:serviceId,reason:'Stale source',grossCents:1200}),/source_stale/);
      await db.exec(`UPDATE doku_eintraege SET version=1 WHERE id='${entry}'`);
      await write({action:'approve',versionId:serviceId,reason:'Confirmed position',grossCents:1200});
    });
    await t.test('new revisions preserve earlier approval and require their own decision',async()=>{
      const revised=await write({action:'save',kind:'service',recordId:serviceRecord,expectedRevision:1,reason:'Changed quantity based on evidence',data:{...data,quantity:2}});
      const rows=await db.query<{state:string;gross_cents:number}>('SELECT state,gross_cents FROM billing_versions WHERE record_id=$1 ORDER BY revision',[serviceRecord]);
      assert.deepEqual(rows.rows,[{state:'approved',gross_cents:1200},{state:'draft',gross_cents:null}]);
      await write({action:'withdraw',versionId:revised,reason:'Draft withdrawn'});
      await assert.rejects(write({action:'approve',versionId:revised,reason:'Invalid retry',grossCents:2400}),/revision_conflict/);
    });
    await t.test('patient roles and explicit read-only deny writes even at RPC layer',async()=>{
      for(const [role,permissions] of [['patient',null],['admin',{module:{rechnungen:'lesen'}}]]){
        await db.query('UPDATE user_profiles SET role=$1,permissions=$2 WHERE id=$3',[role,permissions,actor]);
        await assert.rejects(write(save),/forbidden/);
      }
    });
  }finally{await db.close();}
});

test('workspace contracts reject forged approval fields and unsafe tariff assumptions',()=>{
  assert.equal(tariffInput.safeParse({...tariff,insurerId:null}).success,false);
  assert.equal(tariffInput.safeParse({...tariff,code:'119/120'}).success,false);
  assert.equal(workspaceCommand.safeParse({action:'approve',versionId:randomUUID(),reason:'Valid reason',grossCents:1}).success,false);
  const result=reviewService(service,null,actor,new Date().toISOString());
  assert.equal(result.ok,false);assert.equal(result.grossCents,null);
  assert.equal(sourceIsCurrent(service,null),false);
});
