import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, rgb } from 'pdf-lib';
import { renderAttendanceCertificate, uniqueAttendanceTime } from '../animahost-attendance';

test('an actual Berlin time is required and two different times remain unresolved', () => {
  const visit = { source: 'tagesplan_termine' as const, id: 'visit', occurredAt: '2026-11-19T23:05:00Z' };
  assert.equal(uniqueAttendanceTime([visit], '2026-11-20', '2026-11-20T08:00:00Z')?.time, '00:05');
  assert.equal(uniqueAttendanceTime([visit], '2026-11-19', '2026-11-20T08:00:00Z'), null);
  assert.equal(uniqueAttendanceTime([visit], '2026-11-20', '2026-11-19T23:04:00Z'), null);
  assert.equal(uniqueAttendanceTime([visit, { ...visit, occurredAt: '2026-11-20T06:05:00Z' }], '2026-11-20', '2026-11-20T08:00:00Z'), null);
});

test('certificate renderer fills an existing design and freezes its fields and artwork', async () => {
  const fields = { patientName: 'Mia Muster', serviceDate: '2026-11-20', serviceTime: '10:05', issuedDate: '2026-11-20',
    verificationCode: 'abcdefghijklmnopqrstuvwxyz123456', verificationUrl: 'https://animacura.io/patient/attendance-certificate/verify' };
  const template = await PDFDocument.create();
  const page = template.addPage([595, 842]);
  const form = template.getForm();
  Object.keys(fields).forEach((name, index) => form.createTextField(name).addToPage(page, { x: 50, y: 700 - index * 32, width: 490, height: 24 }));
  ['practiceStamp', 'practiceSignature'].forEach((name, index) => form.createButton(name).addToPage('', page, {
    x: 80 + index * 170, y: 400, width: 120, height: 65, borderColor: rgb(0, 0, 0),
  }));
  const artwork = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+xXqkAAAAASUVORK5CYII=', 'base64');
  const rendered = await renderAttendanceCertificate(await template.save(), artwork, artwork, fields);
  const pdf = await PDFDocument.load(rendered);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getForm().getFields().length, 0);
  await assert.rejects(() => renderAttendanceCertificate(rendered, artwork, artwork, fields));
});
