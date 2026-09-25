import { NextRequest, NextResponse } from "next/server";
import { requirePraxisRole } from "@/lib/require-praxis";
import { createServerClient } from "@/lib/db/supabase";
import {
  fetchIvorisDocument,
  fetchIvorisDocumentEntries,
  type IvorisDocumentEntry,
} from "@/lib/api/ivoris-doku-client";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PatientContext = {
  id: string | null;
  ivorisId: string | null;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
};

function isUuid(value: string | null | undefined) {
  return Boolean(value && UUID_RE.test(value.trim()));
}

function trimOrNull(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toIsoDate(value: string | null) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function inferContentType(name: string | null) {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function buildDownloadName(name: string | null, documentId: string) {
  const fallback = `ivoris-document-${documentId}.bin`;
  if (!name) return fallback;
  const safe = name.replace(/[^a-zA-Z0-9._ -]+/g, "_").trim();
  return safe || fallback;
}

function looksLikeInvoice(value: string | null | undefined) {
  if (!value) return false;
  return /(rechnung|invoice|goz|bema|honorar|kvp|kostenvoranschlag)/i.test(value);
}

function measureContentBytes(contentBase64: string | null) {
  if (!contentBase64) return 0;
  try {
    return Buffer.from(contentBase64, "base64").byteLength;
  } catch {
    return 0;
  }
}

async function resolvePatientContext(request: NextRequest): Promise<PatientContext | null> {
  const patientId = trimOrNull(request.nextUrl.searchParams.get("patient_id"));
  const ivorisId = trimOrNull(request.nextUrl.searchParams.get("ivoris_id"));
  const patientRef = trimOrNull(request.nextUrl.searchParams.get("patient_ref"));

  const db = createServerClient();

  if (patientId) {
    const { data, error } = await db
      .from("patients")
      .select("id, ivoris_id, vorname, nachname, geburtsdatum")
      .eq("id", patientId)
      .maybeSingle();
    if (error) throw new Error(`Patienten-Lookup per patient_id fehlgeschlagen: ${error.message}`);
    if (!data) throw new Error("Zu dieser patient_id wurde kein lokaler Patient gefunden.");
    return {
      id: data.id,
      ivorisId: data.ivoris_id ?? null,
      vorname: data.vorname ?? null,
      nachname: data.nachname ?? null,
      geburtsdatum: data.geburtsdatum ?? null,
    };
  }

  if (ivorisId) {
    const { data, error } = await db
      .from("patients")
      .select("id, ivoris_id, vorname, nachname, geburtsdatum")
      .eq("ivoris_id", ivorisId)
      .limit(1);
    if (error) throw new Error(`Patienten-Lookup per ivoris_id fehlgeschlagen: ${error.message}`);
    const first = data?.[0] ?? null;
    return {
      id: first?.id ?? null,
      ivorisId,
      vorname: first?.vorname ?? null,
      nachname: first?.nachname ?? null,
      geburtsdatum: first?.geburtsdatum ?? null,
    };
  }

  if (patientRef && isUuid(patientRef)) {
    const { data, error } = await db
      .from("patients")
      .select("id, ivoris_id, vorname, nachname, geburtsdatum")
      .or(`id.eq.${patientRef},ivoris_id.eq.${patientRef}`)
      .limit(2);
    if (error) throw new Error(`Patienten-Lookup per patient_ref fehlgeschlagen: ${error.message}`);
    const localIdMatch = data?.find((row) => row.id === patientRef) ?? null;
    const ivorisMatch = data?.find((row) => row.ivoris_id === patientRef) ?? null;
    const picked = localIdMatch ?? ivorisMatch;
    if (!picked) {
      return {
        id: null,
        ivorisId: patientRef,
        vorname: null,
        nachname: null,
        geburtsdatum: null,
      };
    }
    return {
      id: picked.id,
      ivorisId: picked.ivoris_id ?? (ivorisMatch ? patientRef : null),
      vorname: picked.vorname ?? null,
      nachname: picked.nachname ?? null,
      geburtsdatum: picked.geburtsdatum ?? null,
    };
  }

  return null;
}

function mapEntry(entry: IvorisDocumentEntry) {
  return {
    id: entry.id,
    date: entry.date,
    type: entry.type,
    treatment: entry.treatment,
    tooth: entry.tooth,
    text: entry.text,
    documentId: entry.documentId,
    looksLikeInvoice: looksLikeInvoice(entry.text),
  };
}

export async function GET(request: NextRequest) {
  const authError = await requirePraxisRole(["admin", "verwaltung", "lesezugriff"]);
  if (authError) return authError;

  try {
    const begin = toIsoDate(trimOrNull(request.nextUrl.searchParams.get("begin")));
    const end = toIsoDate(trimOrNull(request.nextUrl.searchParams.get("end")));
    const requestedDocumentId = trimOrNull(request.nextUrl.searchParams.get("document_id"));
    const download = request.nextUrl.searchParams.get("download") === "1";
    const hydrateLimit = parsePositiveInt(
      request.nextUrl.searchParams.get("hydrate_limit"),
      requestedDocumentId ? 0 : 5,
      12
    );

    const patient = await resolvePatientContext(request);
    if (!patient && !requestedDocumentId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Bitte patient_id, ivoris_id oder patient_ref angeben. Optional kann zusätzlich document_id gesetzt werden.",
        },
        { status: 400 }
      );
    }

    const resolvedIvorisId = patient?.ivorisId ?? null;
    if (patient && !resolvedIvorisId && !requestedDocumentId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Der lokale Patient ist noch nicht mit einer ivoris_id verknüpft.",
        },
        { status: 409 }
      );
    }

    const entries = resolvedIvorisId
      ? await fetchIvorisDocumentEntries({
          patientIvorisId: resolvedIvorisId,
          begin: begin ?? undefined,
          end: end ?? undefined,
        })
      : [];

    const documentEntries = entries.filter((entry) => Boolean(entry.documentId));
    const entryByDocumentId = new Map(
      documentEntries
        .filter((entry): entry is IvorisDocumentEntry & { documentId: string } => Boolean(entry.documentId))
        .map((entry) => [entry.documentId, entry])
    );

    if (download) {
      if (!requestedDocumentId) {
        return NextResponse.json(
          { ok: false, error: "Für download=1 wird document_id benötigt." },
          { status: 400 }
        );
      }
      const selected = await fetchIvorisDocument(requestedDocumentId);
      const contentBase64 = selected.contentBase64;
      if (!contentBase64) {
        return NextResponse.json(
          { ok: false, error: "IVORIS hat zu diesem Dokument keinen binären Inhalt geliefert." },
          { status: 502 }
        );
      }
      const filename = buildDownloadName(selected.name, requestedDocumentId);
      const contentType = inferContentType(selected.name);
      const buffer = Buffer.from(contentBase64, "base64");
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(buffer.byteLength),
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const documentIdsToHydrate = requestedDocumentId
      ? [requestedDocumentId]
      : documentEntries
          .map((entry) => entry.documentId)
          .filter((value): value is string => Boolean(value))
          .slice(0, hydrateLimit);

    const hydratedDocuments = await Promise.all(
      documentIdsToHydrate.map(async (documentId) => {
        const entry = entryByDocumentId.get(documentId) ?? null;
        const downloadUrl = new URL(request.nextUrl.pathname, request.nextUrl.origin);
        if (patient?.id) downloadUrl.searchParams.set("patient_id", patient.id);
        if (!patient?.id && resolvedIvorisId) downloadUrl.searchParams.set("ivoris_id", resolvedIvorisId);
        if (begin) downloadUrl.searchParams.set("begin", begin);
        if (end) downloadUrl.searchParams.set("end", end);
        downloadUrl.searchParams.set("document_id", documentId);
        downloadUrl.searchParams.set("download", "1");
        try {
          const document = await fetchIvorisDocument(documentId);
          return {
            documentId,
            entryId: entry?.id ?? null,
            entryDate: entry?.date ?? null,
            entryText: entry?.text ?? null,
            name: document.name,
            date: document.date,
            contentBytes: measureContentBytes(document.contentBase64),
            contentType: inferContentType(document.name),
            looksLikeInvoice: looksLikeInvoice(document.name) || looksLikeInvoice(entry?.text),
            downloadUrl: downloadUrl.toString(),
            error: null,
          };
        } catch (error) {
          return {
            documentId,
            entryId: entry?.id ?? null,
            entryDate: entry?.date ?? null,
            entryText: entry?.text ?? null,
            name: null,
            date: null,
            contentBytes: 0,
            contentType: "application/octet-stream",
            looksLikeInvoice: looksLikeInvoice(entry?.text),
            downloadUrl: downloadUrl.toString(),
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return NextResponse.json({
      ok: true,
      patient: patient
        ? {
            id: patient.id,
            ivorisId: patient.ivorisId,
            vorname: patient.vorname,
            nachname: patient.nachname,
            geburtsdatum: patient.geburtsdatum,
          }
        : null,
      range: {
        begin,
        end,
      },
      entriesTotal: entries.length,
      documentEntriesTotal: documentEntries.length,
      hydratedDocuments,
      entries: documentEntries.slice(0, 25).map(mapEntry),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
