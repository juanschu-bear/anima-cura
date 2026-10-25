import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { z } from 'zod';
import { billingDate } from './billing-foundation';
import { invoiceSnapshot } from './billing-invoice';

export const cancelInvoiceCommand = z.object({
  action: z.literal('cancel_invoice'),
  invoiceId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export const abandonInvoiceCommand = z.object({
  action: z.literal('abandon_invoice'),
  invoiceId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export const cancellationSnapshot = z.object({
  original: invoiceSnapshot,
  cancellationDate: billingDate,
  reason: z.string().trim().min(3).max(1000),
}).strict();

export function berlinBillingDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export async function buildInvoiceCancellationPdf(raw: unknown) {
  const snapshot = cancellationSnapshot.parse(raw);
  const original = snapshot.original;
  const number = `${original.invoiceNumber}-S`;
  const pdf = await PDFDocument.create();
  const fixedDate = new Date(`${snapshot.cancellationDate}T00:00:00Z`);
  pdf.setTitle(`Stornobeleg ${number}`);
  pdf.setAuthor('Dr. Maria Elena Schubert');
  pdf.setCreator('Anima Cura');
  pdf.setProducer('Anima Cura');
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.08, 0.29, 0.23), muted = rgb(0.35, 0.42, 0.39);
  let page = pdf.addPage([595.28, 841.89]), y = 785;
  const addPage = () => {
    page = pdf.addPage([595.28, 841.89]); y = 785;
    page.drawText(`Stornobeleg ${number} - Fortsetzung`, { x: 48, y, size: 12, font: bold, color: green }); y -= 30;
  };
  const text = (value: string, size = 11, emphasized = false, color = green) => {
    const font = emphasized ? bold : regular;
    // Measure actual font widths; split even unbroken input at the page margin.
    let line = '';
    for (const char of value.replace(/[\u2013\u2014]/g, '-')) {
      if (char === '\n' || font.widthOfTextAtSize(line + char, size) > 490) {
        const split = char === '\n' ? -1 : line.lastIndexOf(' ');
        const printed = split > 0 ? line.slice(0, split) : line;
        const remaining = split > 0 ? line.slice(split + 1) : '';
        if (y < 65) addPage();
        page.drawText(printed, { x: 48, y, size, font, color }); y -= size + 7;
        line = char === '\n' ? '' : remaining + char;
      } else line += char;
    }
    if (line) {
      if (y < 65) addPage();
      page.drawText(line, { x: 48, y, size, font, color }); y -= size + 7;
    }
  };
  const date = (value: string) => new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(original.totalCents / 100);
  page.drawRectangle({ x: 0, y: 814, width: 595.28, height: 28, color: green });
  text('Dr. Maria Elena Schubert', 17, true);
  text('Zahnärztin für Kieferorthopädie', 10, false, muted);
  text("Nikolaistr. 20 im Oelßner's Hof · 04109 Leipzig", 9, false, muted); y -= 24;
  text(original.patientName, 12, true);
  if (original.patientNumber) text(`Patientennummer: ${original.patientNumber}`, 10, false, muted);
  y -= 24;
  text('STORNOBELEG', 22, true); y -= 12;
  text(`Belegnummer: ${number}`);
  text(`Belegdatum: ${date(snapshot.cancellationDate)}`);
  text(`Bezug: Rechnung ${original.invoiceNumber} vom ${date(original.issueDate)}`); y -= 24;
  text('Die oben genannte Rechnung wird vollständig aufgehoben.', 12, true); y -= 12;
  text('Grund der Aufhebung', 11, true);
  text(snapshot.reason, 11, false, muted); y -= 24;
  if (y < 190) addPage();
  text(`Ursprünglicher Rechnungsbetrag: ${money}`, 12);
  text(`Stornobetrag: -${money}`, 14, true);
  text('Verbleibende Forderung aus dieser Rechnung: 0,00 €', 12, true); y -= 20;
  text('Aus diesem Beleg entsteht keine Zahlungsaufforderung.', 10, false, muted);
  text('Eine gegebenenfalls korrigierte Rechnung erhält eine eigene Rechnungsnummer.', 10, false, muted);
  pdf.getPages().forEach((current, index, pages) => current.drawText(`Seite ${index + 1} von ${pages.length}`, {
    x: 490, y: 28, size: 8, font: regular, color: muted,
  }));
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  return { pdf: bytes, sha256: createHash('sha256').update(bytes).digest('hex'), cancellationNumber: number };
}
