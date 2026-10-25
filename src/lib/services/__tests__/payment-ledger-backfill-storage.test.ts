import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("verified bank import locks source snapshots, preserves decisions and is idempotent", async () => {
  const db = new PGlite();
  const p = "10000000-0000-4000-8000-000000000001";
  const q = "10000000-0000-4000-8000-000000000002";
  const t = "20000000-0000-4000-8000-000000000001";
  const u = "20000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE patients(id uuid PRIMARY KEY,ivoris_nummer text,vorname text,nachname text);
      CREATE TABLE transaktionen(id uuid PRIMARY KEY,betrag numeric,absender_name text,verwendungszweck text,matching_status text,matched_patient_id uuid);
      CREATE TABLE offene_posten(id uuid PRIMARY KEY,patient_id uuid,betrag numeric,status text,unser_zeichen text,rechnung_nr text);
      INSERT INTO patients VALUES('${p}','00001234','Test','Eins'),('${q}','00005678','Test','Zwei');
      INSERT INTO transaktionen VALUES('${t}',100,'Familie','Rate 00001234','auto','${p}'),('${u}',50,'Familie','Rate 00001234','manuell','${p}');`);
    await db.exec(await readFile("supabase/migrations/047_patient_payment_ledger.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/048_payment_ledger_idempotency.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/057_verified_bank_payment_backfill.sql", "utf8"));
    const fingerprint = async () => (await db.query<{ value: string }>("SELECT payment_backfill_catalog_fingerprint() AS value")).rows[0].value;
    const row = async (id: string) => {
      const tx = (await db.query<any>("SELECT * FROM transaktionen WHERE id=$1", [id])).rows[0];
      tx.betrag = Number(tx.betrag);
      return { transaction_id: id, patient_id: p, amount_cents: Math.round(Number(tx.betrag)*100), expected_transaction: tx };
    };
    const run = async (rows: any[], catalog?: string) => (await db.query<{ value: any }>(
      "SELECT import_verified_bank_payment_batch($1,$2::jsonb) AS value", [catalog ?? await fingerprint(), JSON.stringify(rows)])).rows[0].value;
    const first = await row(t);
    assert.equal((await run([first])).imported, 1);
    assert.equal((await run([first])).already_imported, 1);
    assert.equal((await run([first,first])).already_imported, 2);
    assert.equal((await db.query<any>("SELECT count(*)::integer AS n FROM payment_patient_allocations")).rows[0].n, 1);

    const second = await row(u);
    await db.exec(`UPDATE transaktionen SET betrag=60 WHERE id='${u}'`);
    assert.equal((await run([second])).skip_reasons.transaction_changed, 1);
    const current = await row(u);
    const catalog = await fingerprint();
    await db.exec(`UPDATE patients SET nachname='Geändert' WHERE id='${p}'`);
    await assert.rejects(run([current], catalog), /catalogue changed/);

    await db.exec(`UPDATE patients SET ivoris_nummer='00001234' WHERE id='${q}'`);
    assert.equal((await run([current])).skip_reasons.patient_number_not_unique, 1);
    await db.exec(`UPDATE patients SET ivoris_nummer='00005678' WHERE id='${q}'`);
    await db.exec(`UPDATE transaktionen SET verwendungszweck='Rate 00001234 und 00005678' WHERE id='${u}'`);
    assert.equal((await run([await row(u)])).skip_reasons.patient_number_not_unique, 1);
    await db.exec(`UPDATE transaktionen SET verwendungszweck='Rate 00001234' WHERE id='${u}'`);

    await assert.rejects(run([current,{ ...current, transaction_id: "zz-not-a-uuid" }]), /uuid/);
    assert.equal((await db.query<any>("SELECT count(*)::integer AS n FROM payment_patient_allocations WHERE transaction_id=$1", [u])).rows[0].n, 0);
    await db.exec(`INSERT INTO payment_patient_allocations(transaction_id,patient_id,amount_cents,state,confidence_score,decision_reason)
      VALUES('${u}','${p}',6000,'rejected',0,'Synthetic prior rejection');`);
    assert.equal((await run([current])).skip_reasons.prior_journal_decision, 1);
    await db.exec(`INSERT INTO payment_patient_allocations(transaction_id,patient_id,amount_cents,state,confidence_score,decision_reason,reversal_of_allocation_id)
      SELECT transaction_id,patient_id,amount_cents,'reversed',0,'Synthetic reversal',id FROM payment_patient_allocations WHERE transaction_id='${t}';`);
    assert.equal((await run([first])).skip_reasons.prior_journal_decision, 1);
    const privileges = (await db.query<any>("SELECT has_function_privilege('anon','import_verified_bank_payment_batch(text,jsonb)','EXECUTE') AS anon,has_function_privilege('authenticated','import_verified_bank_payment_batch(text,jsonb)','EXECUTE') AS authenticated")).rows[0];
    assert.equal(privileges.anon, false);
    assert.equal(privileges.authenticated, false);
    assert.equal((await db.query<any>("SELECT count(*)::integer AS n FROM offene_posten")).rows[0].n, 0);
  } finally { await db.close(); }
});
