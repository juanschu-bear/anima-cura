import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { billingDate } from "./billing-foundation";

export const issueInvoiceCommand = z.object({
  action: z.literal("issue_invoice"),
  payerVersionId: z.string().uuid(),
  dueDate: billingDate,
  reason: z.string().trim().min(3).max(1000),
}).strict();

const invoiceLine = z.object({
  versionId: z.string().uuid(),
  serviceDate: billingDate,
  schedule: z.enum(["BEMA", "GOZ", "LABOR", "MATERIAL"]),
  code: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  quantity: z.number().int().positive(),
  factor: z.number().positive().nullable().optional(),
  grossCents: z.number().int().positive(),
  justification: z.string().nullable().optional(),
});

export const invoiceSnapshot = z.object({
  invoiceNumber: z.string().regex(/^AC-\d{4}-\d{6}$/),
  replacesInvoiceNumber: z.string().regex(/^AC-\d{4}-\d{6}$/).optional(),
  issueDate: billingDate,
  dueDate: billingDate,
  patientId: z.string().uuid(),
  patientName: z.string().trim().min(1).max(500),
  patientNumber: z.string().nullable().optional(),
  periodFrom: billingDate,
  periodTo: billingDate,
  payerModel: z.enum(["private_full", "statutory_share"]),
  patientShareBasisPoints: z.union([z.literal(1000), z.literal(2000), z.literal(10000)]),
  shareSourceReference: z.string().min(3).max(1000),
  grossCents: z.number().int().positive(),
  totalCents: z.number().int().positive(),
  lines: z.array(invoiceLine).min(1).max(500),
}).strict().superRefine((value, context) => {
  const ids = new Set(value.lines.map(line => line.versionId));
  const gross = value.lines.reduce((sum, line) => sum + line.grossCents, 0);
  const patient = Math.round(gross * value.patientShareBasisPoints / 10000);
  if (ids.size !== value.lines.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["lines"], message: "duplicate_service_version" });
  if (!Number.isSafeInteger(gross) || gross !== value.grossCents) context.addIssue({ code: z.ZodIssueCode.custom, path: ["grossCents"], message: "gross_total_mismatch" });
  if (patient !== value.totalCents) context.addIssue({ code: z.ZodIssueCode.custom, path: ["totalCents"], message: "patient_total_mismatch" });
  if (value.payerModel === "private_full" && value.lines.some(line => line.schedule === "BEMA")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["payerModel"], message: "private_bema_mismatch" });
  if (value.payerModel === "statutory_share" && value.lines.some(line => line.schedule !== "BEMA")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["payerModel"], message: "statutory_schedule_mismatch" });
});

export type InvoiceSnapshot = z.infer<typeof invoiceSnapshot>;

const euro = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const date = (value: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

function safeText(value: string) {
  return value.replace(/[\u2013\u2014]/g, "-").replace(/\u2022/g, "-");
}

function wrap(text: string, max = 72) {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current || `${current} ${word}`.length <= max) current = current ? `${current} ${word}` : word;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildIssuedInvoicePdf(raw: unknown) {
  const snapshot = invoiceSnapshot.parse(raw);
  const document = await PDFDocument.create();
  const fixedDate = new Date(`${snapshot.issueDate}T00:00:00Z`);
  document.setTitle(`Rechnung ${snapshot.invoiceNumber}`);
  document.setAuthor("Dr. Maria Elena Schubert");
  document.setSubject("Kieferorthopädische Rechnung");
  document.setCreator("Anima Cura");
  document.setProducer("Anima Cura");
  document.setCreationDate(fixedDate);
  document.setModificationDate(fixedDate);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.08, 0.29, 0.23);
  const muted = rgb(0.35, 0.42, 0.39);
  let page = document.addPage([595.28, 841.89]);
  let y = 786;
  const draw = (text: string, x: number, size = 10, font = regular, color = rgb(0.08, 0.13, 0.11)) => {
    page.drawText(safeText(text), { x, y, size, font, color });
  };
  const next = (amount = 16) => { y -= amount; };
  const addPage = () => {
    page = document.addPage([595.28, 841.89]); y = 790;
    page.drawRectangle({ x: 0, y: 814, width: 595.28, height: 28, color: green });
    draw(`Rechnung ${snapshot.invoiceNumber} · Fortsetzung`, 48, 12, bold, green);
    next(30);
  };
  page.drawRectangle({ x: 0, y: 814, width: 595.28, height: 28, color: green });
  draw("Dr. Maria Elena Schubert", 48, 17, bold, green); next(20);
  draw("Zahnärztin für Kieferorthopädie", 48, 10, regular, muted); next(14);
  draw("Nikolaistr. 20 im Oelßner's Hof · 04109 Leipzig", 48, 9, regular, muted); next(34);
  draw(snapshot.patientName, 48, 11, bold); next(16);
  if (snapshot.patientNumber) { draw(`Patientennummer: ${snapshot.patientNumber}`, 48, 9, regular, muted); next(14); }
  draw("RECHNUNG", 360, 20, bold, green); next(25);
  draw(`Rechnungsnummer: ${snapshot.invoiceNumber}`, 360, 9); next(14);
  draw(`Rechnungsdatum: ${date(snapshot.issueDate)}`, 360, 9); next(14);
  draw(`Fällig am: ${date(snapshot.dueDate)}`, 360, 9); next(34);
  if (snapshot.replacesInvoiceNumber) { draw(`Korrektur zu Rechnung ${snapshot.replacesInvoiceNumber}`, 48, 10, bold); next(24); }
  draw(`Leistungszeitraum ${date(snapshot.periodFrom)} bis ${date(snapshot.periodTo)}`, 48, 10, bold); next(24);

  for (const line of snapshot.lines) {
    const descriptionLines = wrap(`${line.schedule} ${line.code} · ${line.description}`, 62);
    const required = 18 + Math.max(1, descriptionLines.length) * 12;
    if (y - required < 115) addPage();
    draw(date(line.serviceDate), 48, 8, regular, muted);
    descriptionLines.forEach((entry, index) => {
      if (index > 0) next(12);
      draw(entry, 120, 9, index === 0 ? bold : regular);
    });
    draw(`${line.quantity} ×`, 440, 9);
    draw(euro(line.grossCents), 488, 9, regular);
    next(18);
    if (line.justification) {
      for (const entry of wrap(`Begründung: ${line.justification}`, 76)) { draw(entry, 120, 8, regular, muted); next(11); }
    }
    next(4);
  }

  if (y < 205) addPage();
  page.drawLine({ start: { x: 330, y: y + 8 }, end: { x: 547, y: y + 8 }, thickness: 1, color: green });
  draw("Leistungswert", 330, 10); draw(euro(snapshot.grossCents), 480, 10); next(18);
  if (snapshot.patientShareBasisPoints !== 10000) {
    draw(`Patientenanteil ${snapshot.patientShareBasisPoints / 100} %`, 330, 10); next(18);
  }
  draw("Rechnungsbetrag", 330, 12, bold, green); draw(euro(snapshot.totalCents), 475, 12, bold, green); next(34);
  draw(`Bitte überweise den Rechnungsbetrag bis ${date(snapshot.dueDate)} unter Angabe`, 48, 9); next(13);
  draw(`der Rechnungsnummer ${snapshot.invoiceNumber}.`, 48, 9); next(20);
  draw("Sparkasse Leipzig · IBAN DE03 8605 5592 1090 1189 41 · BIC WELADE8LXXX", 48, 9, bold); next(28);
  for (const entry of wrap("Alle erbrachten Leistungen sind nach § 4 Nr. 14 UStG von der Umsatzsteuer befreit.", 88)) {
    draw(entry, 48, 8, regular, muted); next(11);
  }
  draw("Diese Rechnung wurde revisionssicher in Anima Cura erstellt.", 48, 8, regular, muted);
  const pages = document.getPages();
  pages.forEach((current, index) => current.drawText(`Seite ${index + 1} von ${pages.length}`, {
    x: 490, y: 28, size: 8, font: regular, color: muted,
  }));
  const pdf = Buffer.from(await document.save({ useObjectStreams: false }));
  return { snapshot, pdf, sha256: createHash("sha256").update(pdf).digest("hex") };
}
