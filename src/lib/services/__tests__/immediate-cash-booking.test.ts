import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("a reception command books exactly once, and pending transfer is not paid", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE patients(id uuid PRIMARY KEY);
      CREATE TABLE user_profiles(id uuid PRIMARY KEY, role text);
      CREATE TABLE kassen_zahlungen(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),patient_id uuid,
        betrag numeric,buchungstyp text,zahlart text,kassen_datum date,zweck text,notiz text);
      CREATE TABLE anima_balance_buchungen(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),patient_id uuid,
        betrag numeric,typ text,beschreibung text,referenz_kassen_zahlung_id uuid);`);
    await db.query(readFileSync("supabase/migrations/089_immediate_invoice_cash_booking.sql", "utf8"));
    const patient = "11111111-1111-4111-8111-111111111111";
    const actor = "22222222-2222-4222-8222-222222222222";
    const invoice = "33333333-3333-4333-8333-333333333333";
    const command = "44444444-4444-4444-8444-444444444444";
    await db.query("INSERT INTO patients VALUES($1)", [patient]);
    await db.query("INSERT INTO user_profiles VALUES($1,'verwaltung')", [actor]);
    const call = (id: string, method: string) => db.query<{result: {kassenZahlungId: string;paymentState: string;replayed: boolean}}>(
      "SELECT record_immediate_invoice_payment($1,$2,$3,$4,5000,$5,'AC-SR-2026-000001') AS result",
      [id, invoice, patient, actor, method]);
    const first = (await call(command, "bar")).rows[0].result;
    assert.equal(first.paymentState, "received");
    assert.equal(first.replayed, false);
    const replay = (await call(command, "bar")).rows[0].result;
    assert.equal(replay.kassenZahlungId, first.kassenZahlungId);
    assert.equal(replay.replayed, true);
    assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM kassen_zahlungen")).rows[0].n, 1);
    await assert.rejects(() => call(command, "girocard"), /immediate_payment_command_reused/);
    const transfer = (await call("55555555-5555-4555-8555-555555555555", "qr_ueberweisung")).rows[0].result;
    assert.equal(transfer.paymentState, "awaiting_bank");
    await assert.rejects(() => call("66666666-6666-4666-8666-666666666666", "guthaben"), /immediate_payment_credit_insufficient/);
    assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM kassen_zahlungen")).rows[0].n, 2);
    const rights = (await db.query<{anonymous:boolean;runtime:boolean}>(
      "SELECT has_function_privilege('anon','record_immediate_invoice_payment(uuid,uuid,uuid,uuid,bigint,text,text)','EXECUTE') anonymous,has_function_privilege('service_role','record_immediate_invoice_payment(uuid,uuid,uuid,uuid,bigint,text,text)','EXECUTE') runtime"
    )).rows[0];
    assert.deepEqual(rights, {anonymous:false,runtime:true});
  } finally { await db.close(); }
});
