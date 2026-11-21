import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { decodePDFRawStream, PDFDict, PDFDocument, PDFName, PDFRawStream, rgb } from 'pdf-lib';
import { mayBeAttendanceRequest, renderAttendanceCertificate, uniqueAttendanceTime } from '../animahost-attendance';

test('an actual Berlin time is required and two different times remain unresolved', () => {
  const visit = { source: 'tagesplan_termine' as const, id: 'visit', occurredAt: '2026-11-19T23:05:00Z' };
  assert.equal(uniqueAttendanceTime([visit], '2026-11-20', '2026-11-20T08:00:00Z')?.time, '00:05');
  assert.equal(uniqueAttendanceTime([visit], '2026-11-19', '2026-11-20T08:00:00Z'), null);
  assert.equal(uniqueAttendanceTime([visit], '2026-11-20', '2026-11-19T23:04:00Z'), null);
  assert.equal(uniqueAttendanceTime([visit, { ...visit, occurredAt: '2026-11-20T06:05:00Z' }], '2026-11-20', '2026-11-20T08:00:00Z'), null);
});

test('attendance-only requests recognize German and English certificate wording', () => {
  assert.ok(mayBeAttendanceRequest('Ich brauche eine Anwesenheitsbescheinigung für die Schule.'));
  assert.ok(mayBeAttendanceRequest('Could I get proof of attendance for school?'));
  assert.equal(mayBeAttendanceRequest('Ich möchte meinen Termin absagen.'), false);
});

test('certificate renderer embeds Unicode fonts, fits names and freezes both language versions', async (context) => {
  const fields = { patientName: '', serviceDate: '2026-11-18', serviceTime: '10:05', issuedDate: '2026-11-21',
    verificationCode: 'abcdefghijklmnopqrstuvwxyz123456', verificationUrl: 'https://animacura.io/patient/attendance-certificate/verify' };
  const template = await PDFDocument.create();
  const page = template.addPage([595, 842]);
  const form = template.getForm();
  Object.keys(fields).forEach((name, index) => form.createTextField(name).addToPage(page, {
    x: 50, y: 700 - index * 32, width: name === 'patientName' ? 250 : 490, height: 24,
  }));
  ['practiceStamp', 'practiceSignature'].forEach((name, index) => form.createButton(name).addToPage('', page, {
    x: 80 + index * 170, y: 400, width: 120, height: 65, borderColor: rgb(0, 0, 0),
  }));
  const artwork = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+xXqkAAAAASUVORK5CYII=', 'base64');
  const blank = await template.save();
  const cases = [
    { name: 'Jörg Weißmüller', language: 'de', dates: ['18.11.2026', '21.11.2026'] },
    { name: 'Elif Yılmaz', language: 'en', dates: ['18 November 2026', '21 November 2026'] },
    { name: 'Łukasz Żółć', language: 'de', dates: ['18.11.2026', '21.11.2026'] },
    { name: 'Anna-Maria Magdalena Weißmüller-Schwarzenberger', language: 'en', dates: ['18 November 2026', '21 November 2026'] },
  ] as const;
  for (const { name, language, dates } of cases) {
    await context.test(name, async (caseContext) => {
      const rendered = await renderAttendanceCertificate(blank, artwork, artwork, { ...fields, patientName: name }, language);
      const pdf = await PDFDocument.load(rendered);
      assert.equal(pdf.getPageCount(), 1);
      assert.equal(pdf.getForm().getFields().length, 0);
      const xObjects = pdf.getPages()[0].node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
      const nameAppearance = xObjects && pdf.context.lookup(xObjects.entries()[0][1], PDFRawStream);
      assert.ok(nameAppearance);
      const stream = Buffer.from(decodePDFRawStream(nameAppearance).decode()).toString();
      const size = Number(/ ([\d.]+) Tf/.exec(stream)?.[1]);
      assert.ok(name.length > 30 ? size >= 9 && size < 13.5 : size === 13.5, `name size: ${size}`);

      const input = Buffer.from(rendered);
      const info = spawnSync('pdfinfo', ['-'], { input, encoding: 'utf8' });
      if ((info.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        caseContext.diagnostic('pdfinfo is not installed');
      } else {
        assert.equal(info.status, 0, info.stderr);
        assert.doesNotMatch(info.stderr, /Syntax Error/i);
      }
      const extracted = spawnSync('pdftotext', ['-layout', '-', '-'], { input, encoding: 'utf8' });
      if ((extracted.error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT') {
        assert.equal(extracted.status, 0, extracted.stderr);
        for (const value of [name, ...dates]) assert.ok(extracted.stdout.includes(value), `PDF is missing ${value}`);
      }
    });
  }
});
