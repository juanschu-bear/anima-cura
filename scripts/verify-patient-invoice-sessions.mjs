/** Run against three explicitly provided, existing patient sessions. Never creates logins or sends mail.
 * INVOICE_SESSION_CASES_FILE points to a private JSON array of {kind,cookieFile,expectedPatientIds,minimumDocuments,expectedDocumentIds?}.
 * kind: single | siblings | membership. cookieFile contains the Cookie header from an authorized patient session.
 */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
const cases=JSON.parse(readFileSync(process.env.INVOICE_SESSION_CASES_FILE,'utf8'));
assert.deepEqual(cases.map(c=>c.kind).sort(),['membership','siblings','single']);
const base='https://animacura.io';
for(const c of cases){
 const headers={Cookie:readFileSync(c.cookieFile,'utf8').trim()};
 assert.ok(headers.Cookie);assert.ok(c.expectedPatientIds?.length);assert.ok(c.minimumDocuments>=1);
 const response=await fetch(base+'/api/patient/rechnungen',{headers,redirect:'error'});
 assert.equal(response.status,200,`${c.kind}: list HTTP failure`);
 const body=await response.json();assert.equal(body.belegeStatus,'available',`${c.kind}: documents unavailable`);
 assert.equal(body.hochgeladeneRechnungenStatus,'available',`${c.kind}: uploads unavailable`);
 const docs=body.rechnungen.filter(r=>r.beleg?.pdfUrl);
 assert.ok(docs.length>=c.minimumDocuments,`${c.kind}: missing documents`);
 for(const id of c.expectedDocumentIds??[])assert.ok(docs.some(d=>d.beleg.id===id),`${c.kind}: expected document missing`);
 for(const patientId of c.expectedPatientIds)assert.ok(docs.some(d=>d.patientId===patientId),`${c.kind}: expected patient missing`);
 assert.ok(docs.every(d=>c.expectedPatientIds.includes(d.patientId)),`${c.kind}: unexpected patient scope`);
 for(const doc of docs){
  const url=new URL(doc.beleg.pdfUrl,base);assert.equal(url.origin,base);assert.match(url.pathname,/^\/api\/patient\/rechnungen\/[0-9a-f-]+\/pdf$/i);
  const pdf=await fetch(url,{headers,redirect:'error'});assert.equal(pdf.status,200,`${c.kind}: PDF HTTP failure`);
  assert.ok(pdf.headers.get('content-type')?.includes('application/pdf'));const bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok((await PDFDocument.load(bytes)).getPageCount()>0);
 }
 const documents=await fetch(base+'/api/patient/dokumente',{headers,redirect:'error'});assert.equal(documents.status,200);
 const other=await documents.json();assert.ok(other.dokumente.every(d=>!['rechnung','erste_rechnung'].includes(d.typ)&&!/^\[\[typ:(rechnung|erste_rechnung)\]\]/.test(d.name??'')));
 console.log(JSON.stringify({case:c.kind,documents:docs.length,pdfsLoaded:docs.length,invoiceDocumentsHidden:true,verifiedAt:new Date().toISOString()}));
}
