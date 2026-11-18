import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  holdRejectedInvoiceDelivery,
  invoiceDocumentQuarter,
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
  assert.deepEqual(Array.from(await loadActiveInvoiceDeliveryHoldPatientIds(db)).sort(), ["p-1", "p-2"]);
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

test("invoice delivery failures resolve the billed quarter from both document labels", () => {
  assert.equal(invoiceDocumentQuarter("Rechnung 3/2026"), "2026-Q3");
  assert.equal(invoiceDocumentQuarter("Rechnung Q4 2026"), "2026-Q4");
  assert.equal(invoiceDocumentQuarter("Behandlungsplan"), null);
});

test("a rejection creates an active hold even before the expanded reason constraint is installed", async () => {
  const written: Array<Array<{ reason: string }>> = [];
  const db = {
    from: (table: string) => ({
      select: () => table === "communication_messages"
        ? { eq: () => ({ maybeSingle: async () => ({ data: { metadata: { documentIds: ["doc"] } }, error: null }) }) }
        : { in: async () => ({ data: [{ id: "doc", patient_id: "patient", name: "Rechnung 3/2026" }], error: null }) },
      upsert: async (rows: Array<{ reason: string }>) => {
        written.push(rows);
        return { error: written.length === 1 ? { code: "23514" } : null };
      },
    }),
  };
  assert.deepEqual(await holdRejectedInvoiceDelivery(db, "mail", "bounced"), { held: 1 });
  assert.equal(written[0][0].reason, "email_rejected");
  assert.equal(written[1][0].reason, "no_usable_email");
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
      CREATE TABLE communication_messages(id uuid PRIMARY KEY, metadata jsonb);
      CREATE TABLE communication_events(id uuid PRIMARY KEY, message_id uuid, event_type text);
      CREATE TABLE patient_documents(id uuid PRIMARY KEY, patient_id uuid, name text);
      INSERT INTO user_profiles VALUES ('${actor}', 'verwaltung');`);
    await db.exec(await readFile("supabase/migrations/085_q3_invoice_delivery_holds.sql", "utf8"));
    await db.query("INSERT INTO patient_documents VALUES($1,$2,'Rechnung 3/2026')", [document, patient]);
    await db.query("INSERT INTO communication_messages VALUES($1,$2::jsonb)", ["10000000-0000-4000-8000-000000000004", JSON.stringify({ documentIds: [document] })]);
    await db.query("INSERT INTO communication_events VALUES($1,$2,'bounced')", ["10000000-0000-4000-8000-000000000005", "10000000-0000-4000-8000-000000000004"]);
    await db.exec(await readFile("supabase/migrations/086_invoice_delivery_failure_holds.sql", "utf8"));
    const seeded = (await db.query<{ reason: string }>("SELECT reason FROM invoice_delivery_holds WHERE document_id=$1", [document])).rows[0];
    assert.equal(seeded.reason, "email_rejected");
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
