import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { invoiceReferences, planInvoiceReconciliation } from "../../payment-invoice-reconciliation";

const invoice = {id:"i",patient_id:"p",unser_zeichen:"00001234-1/2026",betrag:100,gezahlt:100,offen:0,
  status:"bezahlt",rechnung_datum:"2026-01-01",bezahlt_am:"2026-02-01",nicht_mahnen:false};
const payment = {id:"a",patient_id:"p",transaction_id:"t",amount_cents:10000,state:"confirmed_auto",source_key:"verified-bank-v1:t"};
const bank = {id:"t",betrag:100,datum:"2026-02-01",verwendungszweck:"Rechnung 00001234-1/2026",matching_status:"auto",matched_patient_id:"p"};

test("invoice proof never adds the same source to legacy paid totals",()=>{
  const result=planInvoiceReconciliation([invoice],[payment],[bank],new Set());
  assert.equal(result.plans[0].changeCents,0);
  const partial=planInvoiceReconciliation([{...invoice,gezahlt:20,offen:80,status:"teilbezahlt"}],[payment],[bank],new Set());
  assert.equal(partial.plans[0].targetPaidCents,10000);
  assert.equal(partial.plans[0].changeCents,8000);
});
test("references preserve suffixes and multiple references are not assigned arbitrarily",()=>{
  assert.deepEqual(invoiceReferences("00001234-1/2026-10"),["00001234-1/2026-10"]);
  assert.equal(planInvoiceReconciliation([invoice],[payment],[{...bank,verwendungszweck:"00001234-1/2026 und 00005678-1/2026"}],new Set()).plans.length,0);
  assert.equal(planInvoiceReconciliation([invoice,{...invoice,id:"duplicate"}],[payment],[bank],new Set()).plans.length,0);
});
test("ambiguous counters, review records, overpayments and used sources remain untouched",()=>{
  for(const changed of [{...invoice,offen:100},{...invoice,nicht_mahnen:true},{...invoice,status:"storniert"},{...invoice,betrag:50,gezahlt:50}]) {
    assert.equal(planInvoiceReconciliation([changed],[payment],[bank],new Set()).plans.length,0);
  }
  assert.equal(planInvoiceReconciliation([invoice],[payment],[bank],new Set([payment.id])).plans.length,0);
  assert.equal(planInvoiceReconciliation([invoice],[payment],[{...bank,datum:"2025-12-01"}],new Set()).plans.length,0);
  assert.equal(planInvoiceReconciliation([invoice],[payment],[bank],new Set(),new Set([invoice.id])).plans.length,0);
});

test("SQL invoice reconciliation is atomic, source-locked, idempotent and non-additive",async()=>{
  const db=new PGlite(); const p=randomUUID();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE patients(id uuid PRIMARY KEY,ivoris_nummer text,vorname text,nachname text);
      CREATE TABLE transaktionen(id uuid PRIMARY KEY,betrag numeric,datum date,absender_name text,verwendungszweck text,matching_status text,matched_patient_id uuid);
      CREATE TABLE offene_posten(id uuid PRIMARY KEY,patient_id uuid,betrag numeric,gezahlt numeric,offen numeric,status text,unser_zeichen text,rechnung_nr text,rechnung_datum date,bezahlt_am date,nicht_mahnen boolean);
      INSERT INTO patients VALUES('${p}','00001234','Test','Patient');`);
    for(const migration of ["047_patient_payment_ledger.sql","048_payment_ledger_idempotency.sql","057_verified_bank_payment_backfill.sql","058_verified_invoice_payment_reconciliation.sql"])
      await db.exec(await readFile(`supabase/migrations/${migration}`,"utf8"));
    for(const text of ["00001234 - 01 / 2026 / Zahlung","00001234-1/2026-10","00001234-1/2026 zweimal 00001234-1/2026","00001234-1/2026 und 00001234-2/2026"]) {
      const sql=(await db.query<any>("SELECT verified_invoice_reference_tokens($1) AS refs",[text])).rows[0].refs;
      assert.deepEqual([...sql].sort(),invoiceReferences(text).sort());
    }
    const seed=async(sequence:number,gross:number,paid:number,amount:number)=>{
      const i=randomUUID(),t=randomUUID(),a=randomUUID(),reference=`00001234-${sequence}/2026`;
      await db.query("INSERT INTO offene_posten VALUES($1,$2,$3,$4,$5,$6,$7,null,'2026-01-01',null,false)",[i,p,gross,paid,gross-paid,paid===gross?"bezahlt":"teilbezahlt",reference]);
      await db.query("INSERT INTO transaktionen VALUES($1,$2,'2026-02-01','Test',$3,'auto',$4)",[t,amount,`Rechnung ${reference}`,p]);
      await db.query("INSERT INTO payment_patient_allocations(id,transaction_id,patient_id,amount_cents,state,confidence_score,decision_reason,confirmed_at,source_key) VALUES($1,$2,$3,$4,'confirmed_auto',100,'Synthetic proof',now(),$5)",[a,t,p,amount*100,`verified-bank-v1:${t}`]);
      const item=(await db.query<any>("SELECT * FROM offene_posten WHERE id=$1",[i])).rows[0];
      for(const key of ["betrag","gezahlt","offen"])item[key]=Number(item[key]);
      item.rechnung_datum=new Date(item.rechnung_datum).toISOString().slice(0,10);
      const tx=(await db.query<any>("SELECT id,betrag,datum,verwendungszweck,matching_status,matched_patient_id FROM transaktionen WHERE id=$1",[t])).rows[0];
      tx.betrag=Number(tx.betrag);
      tx.datum=new Date(tx.datum).toISOString().slice(0,10);
      const catalog=(await db.query<any>("SELECT payment_backfill_catalog_fingerprint() AS hash")).rows[0].hash;
      return {request_id:randomUUID(),catalog,invoice_id:i,expected_invoice:item,payments:[{allocation_id:a,expected_bank:tx}]};
    };
    const run=async(request:any)=>(await db.query<any>("SELECT reconcile_verified_invoice_payments($1::jsonb) AS value",[JSON.stringify(request)])).rows[0].value;
    const full=await seed(1,100,100,100);
    assert.equal((await run(full)).debt_reduction_cents,0);
    assert.equal((await run(full)).already_applied,true);
    assert.equal((await db.query<any>("SELECT count(*)::integer AS n FROM payment_invoice_allocations")).rows[0].n,1);
    const decorated=await seed(5,100,100,100);
    decorated.payments[0].expected_bank.verwendungszweck += " / Zahlung";
    await db.query("UPDATE transaktionen SET verwendungszweck=$1 WHERE id=$2",[decorated.payments[0].expected_bank.verwendungszweck,decorated.payments[0].expected_bank.id]);
    assert.equal((await run(decorated)).debt_reduction_cents,0);
    const partial=await seed(2,200,50,120);
    assert.equal((await run(partial)).debt_reduction_cents,7000);
    const paid=(await db.query<any>("SELECT gezahlt,offen FROM offene_posten WHERE id=$1",[partial.invoice_id])).rows[0];
    assert.equal(Number(paid.gezahlt),120);assert.equal(Number(paid.offen),80);
    const overflow=await seed(3,100,0,150);
    await assert.rejects(run(overflow),/payments exceed/);
    assert.equal((await db.query<any>("SELECT count(*)::integer AS n FROM payment_invoice_allocations WHERE invoice_id=$1",[overflow.invoice_id])).rows[0].n,0);
    await db.query("UPDATE transaktionen SET verwendungszweck='different' WHERE id=$1",[overflow.payments[0].expected_bank.id]);
    await assert.rejects(run(overflow),/bank source changed/);
    const stale=await seed(4,100,0,100);
    await db.query("UPDATE offene_posten SET gezahlt=10 WHERE id=$1",[stale.invoice_id]);
    await assert.rejects(run(stale),/invoice source changed/);
    const reversed=await seed(6,100,0,100);
    await db.query("INSERT INTO payment_patient_allocations(transaction_id,patient_id,amount_cents,state,confidence_score,decision_reason,reversal_of_allocation_id) SELECT transaction_id,patient_id,amount_cents,'reversed',0,'Synthetic reversal',id FROM payment_patient_allocations WHERE id=$1",[reversed.payments[0].allocation_id]);
    await assert.rejects(run(reversed),/payment source not eligible/);
    const privilege=(await db.query<any>("SELECT has_function_privilege('authenticated','reconcile_verified_invoice_payments(jsonb)','EXECUTE') AS permitted")).rows[0];
    assert.equal(privilege.permitted,false);
  } finally {await db.close();}
});
