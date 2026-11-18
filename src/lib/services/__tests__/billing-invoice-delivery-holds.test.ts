import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  isPaymentReminderTrigger,
  loadActiveInvoiceDeliveryHoldPatientIds,
} from "../../invoice-delivery-holds";

test("Q3 invoice delivery holds protect only payment reminder triggers", () => {
  assert.equal(isPaymentReminderTrigger("rate_faellig_bald"), true);
  assert.equal(isPaymentReminderTrigger("rate_ueberfaellig"), true);
  assert.equal(isPaymentReminderTrigger("rechnung_verfuegbar"), false);
});

test("active hold patient IDs are deduplicated", async () => {
  const db = {
    from: () => ({
      select: () => ({
        eq: async () => ({
          data: [{ patient_id: "p-1" }, { patient_id: "p-1" }, { patient_id: "p-2" }],
          error: null,
        }),
      }),
    }),
  };
  assert.deepEqual([...await loadActiveInvoiceDeliveryHoldPatientIds(db)].sort(), ["p-1", "p-2"]);
});

test("an unreadable hold register fails closed", async () => {
  const db = {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: null, error: { message: "unavailable" } }),
      }),
    }),
  };
  await assert.rejects(loadActiveInvoiceDeliveryHoldPatientIds(db), /holds unavailable/);
});

test("handoff release is role-scoped, audited and idempotent", async () => {
  const db = new PGlite();
  const actor = "10000000-0000-4000-8000-000000000001";
  const patient = "10000000-0000-4000-8000-000000000002";
  const document = "10000000-0000-4000-8000-000000000003";
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE user_profiles(id uuid PRIMARY KEY, role text);
      INSERT INTO user_profiles VALUES ('${actor}', 'verwaltung');`);
    await db.exec(await readFile("supabase/migrations/085_q3_invoice_delivery_holds.sql", "utf8"));
    await db.query(`INSERT INTO invoice_delivery_holds(patient_id,document_id,quarter,reason)
      VALUES($1,$2,'2026-Q3','no_usable_email')`, [patient, document]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [actor]);
    await db.exec("SET ROLE authenticated");
    const first = (await db.query<{ result: { status: string; handoffMethod: string; releasedBy: string } }>(
      "SELECT confirm_invoice_delivery_handoff($1,'in_person','Synthetic handoff') AS result", [document],
    )).rows[0].result;
    assert.equal(first.status, "released");
    assert.equal(first.handoffMethod, "in_person");
    assert.equal(first.releasedBy, actor);
    const second = (await db.query<{ result: { status: string } }>(
      "SELECT confirm_invoice_delivery_handoff($1,'in_person','Synthetic retry') AS result", [document],
    )).rows[0].result;
    assert.equal(second.status, "released");
    await db.exec("RESET ROLE");
    const row = (await db.query<{ released_by: string; release_note: string }>(
      "SELECT released_by,release_note FROM invoice_delivery_holds WHERE document_id=$1", [document],
    )).rows[0];
    assert.equal(row.released_by, actor);
    assert.equal(row.release_note, "Synthetic handoff");
  } finally {
    await db.close();
  }
});
