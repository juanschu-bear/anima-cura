import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { abandonInvoiceCommand, berlinBillingDate, buildInvoiceCancellationPdf, cancelInvoiceCommand } from '../../billing-invoice-cancellation';

const original={invoiceNumber:'AC-2026-000001',issueDate:'2026-10-24',dueDate:'2026-11-07',
  patientId:'1ab0dc07-6209-44c1-bd56-ee5098ddc22e',patientName:'Erika Mustermann',patientNumber:'00001234',
  periodFrom:'2026-07-01',periodTo:'2026-09-30',payerModel:'statutory_share',patientShareBasisPoints:2000,
  shareSourceReference:'Synthetic evidence',grossCents:1200,totalCents:240,
  lines:[{versionId:'21b0dc07-6209-44c1-bd56-ee5098ddc22e',serviceDate:'2026-09-10',schedule:'BEMA',code:'119',description:'Synthetic service',quantity:1,factor:null,grossCents:1200,justification:null}]};

test('cancellation requires an invoice and reason, never accepts client financial changes',()=>{
  const command={action:'cancel_invoice',invoiceId:original.patientId,reason:'Korrektur erforderlich'};
  assert.equal(cancelInvoiceCommand.safeParse(command).success,true);
  assert.equal(cancelInvoiceCommand.safeParse({...command,reason:' '}).success,false);
  assert.equal(cancelInvoiceCommand.safeParse({...command,totalCents:0}).success,false);
});

test('cancellation date follows the Berlin business date across midnight and DST',()=>{
  assert.equal(berlinBillingDate(new Date('2026-10-24T22:30:00Z')),'2026-10-25');
  assert.equal(berlinBillingDate(new Date('2026-10-25T23:30:00Z')),'2026-10-26');
});
test('abandonment accepts only an invoice reference and a bounded explicit reason',()=>{
  const command={action:'abandon_invoice',invoiceId:original.patientId,reason:'Abgebrochener Upload'};
  assert.equal(abandonInvoiceCommand.safeParse(command).success,true);
  assert.equal(abandonInvoiceCommand.safeParse({...command,reason:'  '}).success,false);
  assert.equal(abandonInvoiceCommand.safeParse({...command,reason:'a'.repeat(1001)}).success,false);
  assert.equal(abandonInvoiceCommand.safeParse({...command,status:'void'}).success,false);
});

test('cancellation PDF preserves its original reference and is deterministic on retry',async()=>{
  const input={original,cancellationDate:'2026-10-25',reason:'Falscher Leistungsumfang - fachlich korrigiert.'};
  const first=await buildInvoiceCancellationPdf(input),second=await buildInvoiceCancellationPdf(input);
  assert.equal(first.sha256,second.sha256);
  assert.equal(first.cancellationNumber,'AC-2026-000001-S');
  const pdf=await PDFDocument.load(first.pdf);
  assert.equal(pdf.getTitle(),'Stornobeleg AC-2026-000001-S');
  assert.equal(pdf.getPageCount(),1);
});
