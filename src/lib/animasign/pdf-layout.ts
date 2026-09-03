import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function formatSignedAt(value: string | null): string {
  if (!value) return "Zeitpunkt unbekannt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export async function appendReservedSignaturePage(
  pdf: Buffer,
  patientName: string,
): Promise<{ pdfBuffer: Buffer; signaturePage: number }> {
  const doc = await PDFDocument.load(pdf);
  const page = doc.addPage([595.28, 841.89]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const signaturePage = doc.getPageCount();
  const { width, height } = page.getSize();
  const frameColor = rgb(0.82, 0.84, 0.82);
  const textColor = rgb(0.13, 0.17, 0.15);
  const mutedColor = rgb(0.42, 0.47, 0.44);

  page.drawRectangle({
    x: 36,
    y: 36,
    width: width - 72,
    height: height - 72,
    borderWidth: 1,
    borderColor: frameColor,
  });

  page.drawText("Abschluss und Unterschrift", {
    x: 52,
    y: height - 88,
    size: 22,
    font: bold,
    color: textColor,
  });

  page.drawText("Diese Seite ist ausschliesslich fuer Datum und Unterschrift reserviert.", {
    x: 52,
    y: height - 116,
    size: 11,
    font: regular,
    color: mutedColor,
  });

  page.drawText(`Patient: ${patientName}`, {
    x: 52,
    y: height - 152,
    size: 12,
    font: regular,
    color: textColor,
  });

  page.drawText("Bitte unterschreiben Sie nur im vorgesehenen Feld auf dieser Seite.", {
    x: 52,
    y: height - 176,
    size: 11,
    font: regular,
    color: mutedColor,
  });

  page.drawLine({
    start: { x: 52, y: 248 },
    end: { x: width - 52, y: 248 },
    thickness: 1.25,
    color: frameColor,
  });
  page.drawText("Unterschrift", {
    x: 52,
    y: 228,
    size: 11,
    font: regular,
    color: mutedColor,
  });

  page.drawLine({
    start: { x: 52, y: 176 },
    end: { x: width * 0.42, y: 176 },
    thickness: 1,
    color: frameColor,
  });
  page.drawText("Ort", {
    x: 52,
    y: 158,
    size: 10,
    font: regular,
    color: mutedColor,
  });

  page.drawLine({
    start: { x: width * 0.58, y: 176 },
    end: { x: width - 52, y: 176 },
    thickness: 1,
    color: frameColor,
  });
  page.drawText("Datum", {
    x: width * 0.58,
    y: 158,
    size: 10,
    font: regular,
    color: mutedColor,
  });

  page.drawText(`Anamnesebogen · Signaturseite · Seite ${signaturePage} von ${signaturePage}`, {
    x: 52,
    y: 64,
    size: 10,
    font: regular,
    color: mutedColor,
  });

  const pdfBytes = await doc.save();
  return { pdfBuffer: Buffer.from(pdfBytes), signaturePage };
}

export async function rebuildLegacySignedPdf(params: {
  unsignedPdf: Buffer;
  legacySignedPdf: Buffer;
  patientName: string;
  signedAt: string | null;
}): Promise<Buffer> {
  const { unsignedPdf, legacySignedPdf, patientName, signedAt } = params;
  const unsignedDoc = await PDFDocument.load(unsignedPdf);
  const legacyDoc = await PDFDocument.load(legacySignedPdf);
  const out = await PDFDocument.create();

  const unsignedPages = await out.copyPages(
    unsignedDoc,
    unsignedDoc.getPageIndices(),
  );
  for (const page of unsignedPages) out.addPage(page);

  const signaturePage = out.addPage([595.28, 841.89]);
  const regular = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const mono = await out.embedFont(StandardFonts.Courier);
  const { width, height } = signaturePage.getSize();
  const textColor = rgb(0.13, 0.17, 0.15);
  const mutedColor = rgb(0.42, 0.47, 0.44);
  const frameColor = rgb(0.82, 0.84, 0.82);
  const accentColor = rgb(0.14, 0.45, 0.31);

  signaturePage.drawRectangle({
    x: 36,
    y: 36,
    width: width - 72,
    height: height - 72,
    borderWidth: 1,
    borderColor: frameColor,
  });

  signaturePage.drawText("Elektronische Signatur nachgetragen", {
    x: 52,
    y: height - 88,
    size: 22,
    font: bold,
    color: textColor,
  });

  signaturePage.drawText(`Patient: ${patientName}`, {
    x: 52,
    y: height - 132,
    size: 12,
    font: regular,
    color: textColor,
  });

  signaturePage.drawText("Dieses Dokument wurde technisch bereinigt, weil die alte PDF die", {
    x: 52,
    y: height - 176,
    size: 11,
    font: regular,
    color: mutedColor,
  });
  signaturePage.drawText("Unterschrift fehlerhaft mitten im Fragebogen dargestellt hat.", {
    x: 52,
    y: height - 194,
    size: 11,
    font: regular,
    color: mutedColor,
  });

  signaturePage.drawRectangle({
    x: 52,
    y: height - 310,
    width: width - 104,
    height: 78,
    borderWidth: 1,
    borderColor: frameColor,
  });
  signaturePage.drawText("Rechtsverbindliche elektronische Unterzeichnung", {
    x: 68,
    y: height - 262,
    size: 13,
    font: bold,
    color: accentColor,
  });
  signaturePage.drawText(`Zeitpunkt: ${formatSignedAt(signedAt)}`, {
    x: 68,
    y: height - 288,
    size: 12,
    font: mono,
    color: textColor,
  });

  signaturePage.drawText("Das originale Signaturzertifikat der Signierplattform ist auf den", {
    x: 52,
    y: height - 350,
    size: 11,
    font: regular,
    color: mutedColor,
  });
  signaturePage.drawText("nachfolgenden Seiten beigefuegt und bleibt damit weiterhin einsehbar.", {
    x: 52,
    y: height - 368,
    size: 11,
    font: regular,
    color: mutedColor,
  });

  signaturePage.drawLine({
    start: { x: 52, y: 170 },
    end: { x: width - 52, y: 170 },
    thickness: 1.25,
    color: frameColor,
  });
  signaturePage.drawText("Signaturvermerk", {
    x: 52,
    y: 150,
    size: 11,
    font: regular,
    color: mutedColor,
  });

  const unsignedCount = unsignedDoc.getPageCount();
  const legacyCount = legacyDoc.getPageCount();
  if (legacyCount > unsignedCount) {
    const certificatePages = await out.copyPages(
      legacyDoc,
      legacyDoc.getPageIndices().slice(unsignedCount),
    );
    for (const page of certificatePages) out.addPage(page);
  }

  return Buffer.from(await out.save());
}

function extractBase64Payload(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:image\/(?:png|jpe?g);base64,(.+)$/i);
  return match?.[1] ?? null;
}

function formatDateOnly(value: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export async function stampStoredSignatureOnReservedPage(params: {
  unsignedPdf: Buffer;
  signatureDataUrl: string;
  signedAt: string | null;
  signedDateText?: string | null;
  ort?: string | null;
}): Promise<Buffer> {
  const base64Payload = extractBase64Payload(params.signatureDataUrl);
  if (!base64Payload) {
    throw new Error("signature_data_url_invalid");
  }

  const doc = await PDFDocument.load(params.unsignedPdf);
  const pages = doc.getPages();
  const page = pages[pages.length - 1];

  if (!page) {
    throw new Error("signature_page_missing");
  }

  const signatureBytes = Buffer.from(base64Payload, "base64");
  const signatureImage = params.signatureDataUrl.toLowerCase().startsWith("data:image/jpeg")
    ? await doc.embedJpg(signatureBytes)
    : await doc.embedPng(signatureBytes);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const { width, height } = page.getSize();
  const signatureBox = {
    x: 52,
    y: 248,
    width: width - 104,
    height: 120,
  };

  const scaled = signatureImage.scale(1);
  const ratio = Math.min(signatureBox.width / scaled.width, signatureBox.height / scaled.height);
  const drawWidth = scaled.width * ratio;
  const drawHeight = scaled.height * ratio;
  const drawX = signatureBox.x + (signatureBox.width - drawWidth) / 2;
  const drawY = signatureBox.y + (signatureBox.height - drawHeight) / 2;

  page.drawImage(signatureImage, {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
  });

  if (params.ort) {
    page.drawText(params.ort, {
      x: 52,
      y: 182,
      size: 12,
      font: regular,
      color: rgb(0.13, 0.17, 0.15),
    });
  }

  const dateText = params.signedDateText?.trim() || formatDateOnly(params.signedAt);
  if (dateText) {
    page.drawText(dateText, {
      x: width * 0.58,
      y: 182,
      size: 12,
      font: regular,
      color: rgb(0.13, 0.17, 0.15),
    });
  }

  return Buffer.from(await doc.save());
}
