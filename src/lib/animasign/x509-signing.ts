import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { P12Signer } from "@signpdf/signer-p12";
import signpdf from "@signpdf/signpdf";
import { SUBFILTER_ETSI_CADES_DETACHED } from "@signpdf/utils";
import { PDFDocument } from "pdf-lib";

export type PdfSignatureMetadata = {
  reason: string;
  contactInfo: string;
  name: string;
  location: string;
};

/**
 * Adds the signature placeholder through pdf-lib and signs the resulting PDF.
 * This is the supported @signpdf path for PDFs that are created by pdf-lib.
 */
export async function signPdfWithP12(params: {
  pdf: Buffer;
  certificate: Buffer;
  passphrase: string;
  metadata: PdfSignatureMetadata;
}) {
  const pdfDoc = await PDFDocument.load(params.pdf);

  pdflibAddPlaceholder({
    pdfDoc,
    reason: params.metadata.reason,
    contactInfo: params.metadata.contactInfo,
    name: params.metadata.name,
    location: params.metadata.location,
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
  });

  const pdfWithPlaceholder = Buffer.from(await pdfDoc.save());
  const signer = new P12Signer(params.certificate, {
    passphrase: params.passphrase,
  });

  return Buffer.from(await signpdf.sign(pdfWithPlaceholder, signer));
}
