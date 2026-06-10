/**
 * Documenso V2 REST-Client (eigener schlanker Client, "Weg 1").
 *
 * Gegen die offizielle Documenso V2-API gebaut. Alle Endpunkte stammen aus der
 * OpenAPI-Spezifikation der eigenen Instanz (GET /api/v2/openapi.json), nichts geraten:
 *
 *   POST /api/v2/envelope/create                         -> { id: string }   (Envelope-ID)
 *   POST /api/v2/envelope/distribute                     -> { success, id, recipients[].signingUrl }
 *   GET  /api/v2/document/{documentId}/download?version=signed  -> versiegeltes PDF
 *   GET  /api/v2/envelope/{envelopeId}                   -> Envelope inkl. status
 *
 * Auth: Header "Authorization: <api_key>". Der Key enthaelt bereits das "api_"-Praefix,
 * KEIN "Bearer".
 *
 * Env:
 *   ANIMASIGN_API_KEY   = Documenso API-Key (api_...)
 *   DOCUMENSO_BASE_URL  = z.B. https://sign.animacura.io  (mit oder ohne /api/v2)
 *
 * Laeuft nur in der Node-Runtime (Buffer/FormData/Blob/fetch global ab Node 18).
 */

export type DocumensoLanguage =
  | "de"
  | "en"
  | "fr"
  | "es"
  | "it"
  | "nl"
  | "pl"
  | "pt-BR"
  | "ja"
  | "ko"
  | "zh";

export type DocumensoFieldType =
  | "SIGNATURE"
  | "DATE"
  | "NAME"
  | "EMAIL"
  | "INITIALS"
  | "TEXT";

/** Feld-Position in Prozent (0..100) relativ zur PDF-Seite. */
export interface DocumensoField {
  type: DocumensoFieldType;
  /** 1-basierte Seitennummer. */
  page: number;
  /** 0 = links, 100 = rechts. */
  positionX: number;
  /** 0 = oben, 100 = unten. */
  positionY: number;
  /** Breite in % der Seitenbreite. */
  width: number;
  /** Hoehe in % der Seitenhoehe. */
  height: number;
}

export interface CreateEnvelopeInput {
  title: string;
  /** Unsere Submission-ID. Kommt im DOCUMENT_COMPLETED-Webhook als externalId zurueck. */
  externalId: string;
  recipient: { email: string; name: string };
  fields: DocumensoField[];
  pdf: Uint8Array | ArrayBuffer | Buffer;
  pdfFilename: string;
  /** Default "de". */
  language?: DocumensoLanguage;
}

export interface DistributeOptions {
  language?: DocumensoLanguage;
  /** Wohin der Patient nach dem Unterschreiben geleitet wird (optional). */
  redirectUrl?: string;
}

export interface SigningResult {
  envelopeId: string;
  recipientEmail: string;
  recipientName: string;
  token: string;
  /** Direkter Signier-Link. Kann ohne Mailversand zum Weiterleiten genutzt werden. */
  signingUrl: string;
}

export type EnvelopeStatus = "DRAFT" | "PENDING" | "COMPLETED" | "REJECTED";

export class DocumensoError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "DocumensoError";
    this.status = status;
    this.body = body;
  }
}

interface DocumensoConfig {
  baseUrl: string;
  apiKey: string;
}

/** Normalisiert DOCUMENSO_BASE_URL: ohne abschliessenden Slash, mit /api/v2. */
function normalizeBaseUrl(raw: string): string {
  let base = raw.trim().replace(/\/+$/, "");
  if (!/\/api\/v2$/.test(base)) {
    base = `${base}/api/v2`;
  }
  return base;
}

function getConfig(): DocumensoConfig {
  const apiKey = process.env.ANIMASIGN_API_KEY;
  const rawBase = process.env.DOCUMENSO_BASE_URL;
  if (!apiKey) {
    throw new DocumensoError("ANIMASIGN_API_KEY fehlt", 0, "");
  }
  if (!rawBase) {
    throw new DocumensoError("DOCUMENSO_BASE_URL fehlt", 0, "");
  }
  return { baseUrl: normalizeBaseUrl(rawBase), apiKey };
}

function toUint8Array(pdf: Uint8Array | ArrayBuffer | Buffer): Uint8Array<ArrayBuffer> {
  // Kopie in frischen ArrayBuffer (TS 5.7: Uint8Array<ArrayBufferLike> ist kein BlobPart)
  return new Uint8Array(pdf);
}

async function readError(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Legt ein Envelope (Dokument) mit einem Unterzeichner und Feldern an.
 * Status danach: DRAFT. Verteilt wird separat ueber distributeForSigning().
 */
export async function createEnvelope(
  input: CreateEnvelopeInput
): Promise<{ envelopeId: string }> {
  const { baseUrl, apiKey } = getConfig();

  const payload = {
    type: "DOCUMENT" as const,
    title: input.title,
    externalId: input.externalId,
    recipients: [
      {
        email: input.recipient.email,
        name: input.recipient.name,
        role: "SIGNER" as const,
        fields: input.fields,
      },
    ],
    meta: {
      language: input.language ?? "de",
    },
  };

  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  form.append(
    "files",
    new Blob([toUint8Array(input.pdf)], { type: "application/pdf" }),
    input.pdfFilename
  );

  const res = await fetch(`${baseUrl}/envelope/create`, {
    method: "POST",
    headers: { Authorization: apiKey },
    body: form,
  });

  if (!res.ok) {
    throw new DocumensoError(
      `envelope/create fehlgeschlagen (${res.status})`,
      res.status,
      await readError(res)
    );
  }

  const data = (await res.json()) as { id?: unknown };
  if (typeof data.id !== "string") {
    throw new DocumensoError(
      "envelope/create: keine id in der Antwort",
      res.status,
      JSON.stringify(data)
    );
  }
  return { envelopeId: data.id };
}

interface DistributeRecipient {
  id: number;
  name: string;
  email: string;
  token: string;
  role: string;
  signingOrder: number | null;
  signingUrl: string;
}

/**
 * Verteilt das Envelope. distributionMethod "NONE" verschickt KEINE Mail,
 * liefert aber die signingUrl je Empfaenger zurueck. Status danach: PENDING.
 */
export async function distributeForSigning(
  envelopeId: string,
  options: DistributeOptions = {}
): Promise<SigningResult> {
  const { baseUrl, apiKey } = getConfig();

  const meta: Record<string, string> = {
    distributionMethod: "NONE",
    language: options.language ?? "de",
  };
  if (options.redirectUrl) {
    meta.redirectUrl = options.redirectUrl;
  }

  const res = await fetch(`${baseUrl}/envelope/distribute`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ envelopeId, meta }),
  });

  if (!res.ok) {
    throw new DocumensoError(
      `envelope/distribute fehlgeschlagen (${res.status})`,
      res.status,
      await readError(res)
    );
  }

  const data = (await res.json()) as {
    id?: unknown;
    recipients?: unknown;
  };

  const recipients = Array.isArray(data.recipients)
    ? (data.recipients as DistributeRecipient[])
    : [];
  const signer =
    recipients.find((r) => r.role === "SIGNER") ?? recipients[0];

  if (!signer || typeof signer.signingUrl !== "string") {
    throw new DocumensoError(
      "envelope/distribute: keine signingUrl in der Antwort",
      res.status,
      JSON.stringify(data)
    );
  }

  return {
    envelopeId,
    recipientEmail: signer.email,
    recipientName: signer.name,
    token: signer.token,
    signingUrl: signer.signingUrl,
  };
}

/** Bequemlichkeit: anlegen und direkt verteilen, liefert den Signier-Link. */
export async function createAndDistribute(
  input: CreateEnvelopeInput,
  options: DistributeOptions = {}
): Promise<SigningResult> {
  const { envelopeId } = await createEnvelope(input);
  return distributeForSigning(envelopeId, {
    language: input.language,
    ...options,
  });
}

/** Liest ein Envelope (u.a. status). */
export async function getEnvelope(
  envelopeId: string
): Promise<{ status: EnvelopeStatus; raw: Record<string, unknown> }> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(
    `${baseUrl}/envelope/${encodeURIComponent(envelopeId)}`,
    { headers: { Authorization: apiKey } }
  );
  if (!res.ok) {
    throw new DocumensoError(
      `envelope/get fehlgeschlagen (${res.status})`,
      res.status,
      await readError(res)
    );
  }
  const raw = (await res.json()) as Record<string, unknown>;
  return { status: raw.status as EnvelopeStatus, raw };
}

function extractUrl(data: unknown): string | null {
  if (typeof data === "string" && /^https?:\/\//.test(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["downloadUrl", "url", "signedUrl", "href"]) {
      const v = obj[key];
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    }
    for (const v of Object.values(obj)) {
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    }
  }
  return null;
}

/**
 * Laedt das versiegelte PDF herunter.
 * documentId ist die NUMERISCHE id aus der Webhook-Nutzlast (payload.id).
 *
 * Die OpenAPI deklariert die 200-Antwort untypisiert. Dieser Client behandelt
 * daher beide moeglichen Faelle: direktes PDF (Binaer) ODER JSON mit Download-URL.
 * Welcher Fall zutrifft, bestaetigen wir bei der ersten echten Signatur live.
 */
export async function downloadSignedPdf(documentId: number): Promise<Buffer> {
  const { baseUrl, apiKey } = getConfig();
  const res = await fetch(
    `${baseUrl}/document/${documentId}/download?version=signed`,
    { headers: { Authorization: apiKey } }
  );
  if (!res.ok) {
    throw new DocumensoError(
      `document/download fehlgeschlagen (${res.status})`,
      res.status,
      await readError(res)
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/pdf") ||
    contentType.includes("application/octet-stream")
  ) {
    return Buffer.from(await res.arrayBuffer());
  }

  // Sonst: JSON mit Download-URL erwarten.
  const data = (await res.json()) as unknown;
  const fileUrl = extractUrl(data);
  if (!fileUrl) {
    throw new DocumensoError(
      "document/download: weder PDF noch Download-URL erhalten",
      res.status,
      JSON.stringify(data)
    );
  }
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new DocumensoError(
      `Download-URL fehlgeschlagen (${fileRes.status})`,
      fileRes.status,
      await readError(fileRes)
    );
  }
  return Buffer.from(await fileRes.arrayBuffer());
}
