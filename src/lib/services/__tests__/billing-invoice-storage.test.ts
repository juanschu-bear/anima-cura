import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const actor = "10000000-0000-4000-8000-000000000001";
const patient = "10000000-0000-4000-8000-000000000002";
const entry = "10000000-0000-4000-8000-000000000003";

test("invoice issuance reserves one number and atomically publishes debt, document and notification", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE patients(id uuid PRIMARY KEY,vorname text,nachname text,ivoris_nummer text);
      CREATE TABLE user_profiles(id uuid PRIMARY KEY,role text,permissions jsonb);
      CREATE TABLE doku_eintraege(id uuid PRIMARY KEY,patient_id uuid,version integer,termin_datum date,status text,bestaetigt_am timestamptz,positionen jsonb);
      CREATE TABLE offene_posten(id uuid PRIMARY KEY,typ text,rechnung_datum date,patient_name text,rechnung_nr text,unser_zeichen text,basis_nr text,betrag numeric,gebuehr numeric,offen numeric,gezahlt numeric,mahnung_datum date,status text,bezahlt_am date,patient_id uuid,source_file text,imported_at timestamptz,mahnstufe integer,nicht_mahnen boolean);
      CREATE TABLE patient_documents(id uuid PRIMARY KEY,patient_id uuid,name text,typ text,file_url text,hochgeladen_am timestamptz,created_at timestamptz DEFAULT now());
      CREATE TABLE patient_notifications(id uuid PRIMARY KEY,patient_id uuid,typ text,titel text,text text,gelesen boolean,created_at timestamptz DEFAULT now());
      CREATE TABLE payment_invoice_allocations(id uuid PRIMARY KEY,invoice_id uuid,state text,reversal_of_allocation_id uuid);
      INSERT INTO patients VALUES ('${patient}','Erika','Mustermann','00001234');
      INSERT INTO user_profiles VALUES ('${actor}','verwaltung',null);
      INSERT INTO doku_eintraege VALUES ('${entry}','${patient}',1,'2026-07-05','bestaetigt',now(),'[{"code":"BEMA 126a","anzahl":1}]');`);
    await db.exec(await readFile("supabase/migrations/049_billing_versions.sql", "utf8"));
    const write = async (input: unknown) => (await db.query<{ id: string }>(
      "SELECT billing_write($1,$2,$3::jsonb) AS id", [actor, randomUUID(), JSON.stringify(input)],
    )).rows[0].id;
    const tariffRecord = randomUUID();
    const tariffId = await write({ action: "save", kind: "tariff", recordId: tariffRecord, expectedRevision: 0, reason: "Synthetic tariff",
      data: { sourceReference: "SYNTHETIC TEST ONLY", validFrom: "2026-07-01", validTo: "2026-09-30", schedule: "BEMA", code: "126a", insurerId: "test", requiresRegion: true, price: { kind: "points", points: "10", pointValueEuro: "1.2" } } });
    await write({ action: "approve", versionId: tariffId, reason: "Synthetic tariff approved" });
    const serviceId = await write({ action: "save", kind: "service", recordId: randomUUID(), expectedRevision: 0, reason: "Synthetic service",
      data: { patientId: patient, source: { system: "scribe", recordId: entry, version: 1, positionIndex: 0 }, serviceDate: "2026-07-05", schedule: "BEMA", code: "126a", description: "Synthetic service", quantity: 1, region: "11", factor: null, justification: null, insurerId: "test", tariffVersionId: tariffId } });
    await write({ action: "approve", versionId: serviceId, reason: "Synthetic service approved", grossCents: 1200 });
    await db.exec(await readFile("supabase/migrations/051_billing_payer_allocations.sql", "utf8"));
    const payerCase = randomUUID();
    const payerId = (await db.query<{ id: string }>("SELECT billing_payer_write($1,$2,$3::jsonb) AS id", [actor, randomUUID(), JSON.stringify({ action: "save", caseId: payerCase, expectedRevision: 0, reason: "Synthetic share", data: { patientId: patient, from: "2026-07-01", to: "2026-09-30", serviceVersionIds: [serviceId], payerModel: "statutory_share", patientShareBasisPoints: 2000, shareSourceReference: "Synthetic payer evidence", expectedPatientCents: 240 } })])).rows[0].id;
    await db.query("SELECT billing_payer_write($1,$2,$3::jsonb)", [actor, randomUUID(), JSON.stringify({ action: "approve", versionId: payerId, reason: "Synthetic share approved" })]);
    await db.exec(await readFile("supabase/migrations/052_billing_invoice_issuance.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/054_billing_invoice_service_claims.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/055_billing_invoice_cancellations.sql", "utf8"));
    const due = new Date(); due.setUTCDate(due.getUTCDate() + 14); const dueDate = due.toISOString().slice(0, 10);
    const requestId = randomUUID();
    const input = { action: "reserve", payerVersionId: payerId, dueDate, reason: "Synthetic invoice approval" };
    const reserve = async () => (await db.query<{ id: string }>("SELECT billing_invoice_reserve($1,$2,$3::jsonb) AS id", [actor, requestId, JSON.stringify(input)])).rows[0].id;
    const invoiceId = await reserve();
    assert.equal(await reserve(), invoiceId);
    const invoice = (await db.query<{ invoice_number: string; document_id: string }>("SELECT invoice_number,document_id FROM billing_invoices WHERE id=$1", [invoiceId])).rows[0];
    assert.match(invoice.invoice_number, /^AC-\d{4}-000001$/);
    const storagePath = `${patient}/${invoice.document_id}.pdf`;
    // A revision arriving while the PDF is being prepared must roll publication
    // back, including the open item, document and notification already inserted.
    await db.exec("BEGIN");
    await db.query("UPDATE billing_records SET head_version=head_version+1 WHERE id=(SELECT record_id FROM billing_versions WHERE id=$1)", [serviceId]);
    await assert.rejects(db.query("SELECT billing_invoice_finalize($1,$2,$3,$4,$5)", [actor, invoiceId, "a".repeat(64), 100, storagePath]), /service_stale/);
    await db.exec("ROLLBACK");
    assert.equal((await db.query("SELECT * FROM offene_posten")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM patient_documents")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM patient_notifications")).rows.length, 0);
    await db.exec("BEGIN");
    await db.query("UPDATE doku_eintraege SET version=version+1 WHERE id=$1", [entry]);
    await assert.rejects(db.query("SELECT billing_invoice_finalize($1,$2,$3,$4,$5)", [actor, invoiceId, "a".repeat(64), 100, storagePath]), /service_stale/);
    await db.exec("ROLLBACK");
    await db.query("SELECT billing_invoice_finalize($1,$2,$3,$4,$5)", [actor, invoiceId, "a".repeat(64), 100, storagePath]);
    const issued = (await db.query<{ status: string; open_item_id: string }>("SELECT status,open_item_id FROM billing_invoices WHERE id=$1", [invoiceId])).rows[0];
    assert.equal(issued.status, "issued"); assert.equal(issued.open_item_id, invoiceId);
    assert.equal((await db.query("SELECT * FROM offene_posten WHERE id=$1", [invoiceId])).rows.length, 1);
    assert.equal((await db.query("SELECT * FROM patient_documents WHERE id=$1", [invoiceId])).rows.length, 1);
    assert.equal((await db.query("SELECT * FROM patient_notifications")).rows.length, 1);
    await db.query("SELECT billing_invoice_finalize($1,$2,$3,$4,$5)", [actor, invoiceId, "a".repeat(64), 100, storagePath]);
    assert.equal((await db.query("SELECT * FROM offene_posten WHERE id=$1", [invoiceId])).rows.length, 1);
    await assert.rejects(db.query("UPDATE billing_invoices SET total_cents=1 WHERE id=$1", [invoiceId]), /immutable/);
    // A new payer decision is valid evidence, but it cannot re-bill the service.
    const payerId2 = (await db.query<{ id: string }>("SELECT billing_payer_write($1,$2,$3::jsonb) AS id", [actor, randomUUID(), JSON.stringify({ action: "save", caseId: payerCase, expectedRevision: 1, reason: "Revised payer evidence", data: { patientId: patient, from: "2026-07-01", to: "2026-09-30", serviceVersionIds: [serviceId], payerModel: "statutory_share", patientShareBasisPoints: 2000, shareSourceReference: "Revised payer evidence", expectedPatientCents: 240 } })])).rows[0].id;
    await db.query("SELECT billing_payer_write($1,$2,$3::jsonb)", [actor, randomUUID(), JSON.stringify({ action: "approve", versionId: payerId2, reason: "Revised evidence approved" })]);
    await assert.rejects(db.query("SELECT billing_invoice_reserve($1,$2,$3::jsonb)", [actor, randomUUID(), JSON.stringify({ ...input, payerVersionId: payerId2 })]), /already_billed/);
    assert.equal((await db.query("SELECT * FROM billing_invoices")).rows.length, 1);
    assert.equal((await db.query<{ last_value: number }>("SELECT last_value FROM billing_invoice_counters")).rows[0].last_value, 1);
    assert.equal((await db.query("SELECT * FROM billing_invoice_service_claims")).rows.length, 1);
    // Transport retries still succeed after a payer revision: an issued invoice
    // must not be modified or duplicated by its publication retry.
    await db.query("SELECT billing_invoice_finalize($1,$2,$3,$4,$5)", [actor, invoiceId, "a".repeat(64), 100, storagePath]);
    await db.exec("SET ROLE service_role");
    await assert.rejects(db.query("DELETE FROM billing_invoice_service_claims"), /permission denied/);
    await db.exec("RESET ROLE");
    const cancelDocument=randomUUID(),cancelRequest=randomUUID();
    const cancelDate=(await db.query<{date:string}>("SELECT (now() AT TIME ZONE 'Europe/Berlin')::date::text AS date")).rows[0].date;
    const cancelArgs=[actor,cancelRequest,invoiceId,cancelDocument,cancelDate,'Synthetic correction reason','b'.repeat(64),200,`${patient}/${cancelDocument}.pdf`];
    const cancelSql="SELECT billing_invoice_cancel($1,$2,$3,$4,$5,$6,$7,$8,$9)";
    const allocationId=randomUUID();
    await db.query("INSERT INTO payment_invoice_allocations VALUES($1,$2,'allocated_manual',NULL)",[allocationId,invoiceId]);
    await assert.rejects(db.query(cancelSql,cancelArgs),/payment_review/);
    assert.equal((await db.query("SELECT * FROM billing_invoice_cancellations")).rows.length,0);
    await db.query("INSERT INTO payment_invoice_allocations VALUES($1,$2,'reversed',$3)",[randomUUID(),invoiceId,allocationId]);
    await db.query("UPDATE offene_posten SET gezahlt=1,offen=betrag-1 WHERE id=$1",[invoiceId]);
    await assert.rejects(db.query(cancelSql,cancelArgs),/payment_review/);
    await db.query("UPDATE offene_posten SET gezahlt=0,offen=betrag WHERE id=$1",[invoiceId]);
    const originalSnapshot=(await db.query<{snapshot:unknown}>("SELECT snapshot FROM billing_invoices WHERE id=$1",[invoiceId])).rows[0].snapshot;
    await db.query(cancelSql,cancelArgs);
    await db.query(cancelSql,cancelArgs);
    await assert.rejects(db.query(cancelSql,[...cancelArgs.slice(0,1),randomUUID(),...cancelArgs.slice(2,5),'Different reason',...cancelArgs.slice(6)]),/conflict/);
    const cancelled=(await db.query<{status:string;snapshot:unknown}>("SELECT status,snapshot FROM billing_invoices WHERE id=$1",[invoiceId])).rows[0];
    assert.equal(cancelled.status,'void');assert.deepEqual(cancelled.snapshot,originalSnapshot);
    const cancelledItem=(await db.query<{status:string;offen:string;betrag:string;nicht_mahnen:boolean}>("SELECT status,offen,betrag,nicht_mahnen FROM offene_posten WHERE id=$1",[invoiceId])).rows[0];
    assert.equal(cancelledItem.status,'storniert');assert.equal(Number(cancelledItem.offen),0);assert.equal(Number(cancelledItem.betrag),2.4);assert.equal(cancelledItem.nicht_mahnen,true);
    await assert.rejects(db.query("UPDATE offene_posten SET status='offen',offen=betrag WHERE id=$1",[invoiceId]),/cancelled/);
    await assert.rejects(db.query("DELETE FROM offene_posten WHERE id=$1",[invoiceId]),/immutable/);
    assert.equal((await db.query("SELECT * FROM patient_documents")).rows.length,2);
    assert.equal((await db.query("SELECT * FROM patient_notifications")).rows.length,2);
    assert.equal((await db.query("SELECT * FROM billing_invoice_service_claims")).rows.length,0);
    await assert.rejects(db.query("INSERT INTO payment_invoice_allocations VALUES($1,$2,'allocated_manual',NULL)",[randomUUID(),invoiceId]),/cancelled/);
    await assert.rejects(db.query("DELETE FROM billing_invoice_cancellations"),/immutable/);
    await assert.rejects(db.query("UPDATE billing_invoices SET status='issued' WHERE id=$1",[invoiceId]),/immutable/);
    // Correction requires a separately approved payer revision and gets a new
    // number, while the original and its cancellation remain immutable.
    const replacement=(await db.query<{id:string}>("SELECT billing_invoice_reserve($1,$2,$3::jsonb) AS id",[actor,randomUUID(),JSON.stringify({...input,payerVersionId:payerId2})])).rows[0].id;
    assert.notEqual(replacement,invoiceId);
    const replacementInvoice=(await db.query<{invoice_number:string;document_id:string;replaces_invoice_id:string;snapshot:{replacesInvoiceNumber:string}}>("SELECT invoice_number,document_id,replaces_invoice_id,snapshot FROM billing_invoices WHERE id=$1",[replacement])).rows[0];
    assert.match(replacementInvoice.invoice_number,/-000002$/);
    assert.equal(replacementInvoice.replaces_invoice_id,invoiceId);
    assert.equal(replacementInvoice.snapshot.replacesInvoiceNumber,invoice.invoice_number);
    await db.query("SELECT billing_invoice_finalize($1,$2,$3,$4,$5)",[actor,replacement,'c'.repeat(64),100,`${patient}/${replacementInvoice.document_id}.pdf`]);
    assert.equal((await db.query("SELECT * FROM billing_invoice_service_claims WHERE invoice_id=$1",[replacement])).rows.length,1);
    await db.exec("SET ROLE authenticated");
    await assert.rejects(db.query("SELECT * FROM billing_invoices"), /permission denied/);
    await assert.rejects(db.query(cancelSql,cancelArgs), /permission denied/);
  } finally { await db.close(); }
});
