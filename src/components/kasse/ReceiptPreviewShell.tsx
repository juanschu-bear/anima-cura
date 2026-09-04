"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer, X } from "lucide-react";
import {
  buildReceiptPdfHref,
  buildReceiptPreviewHref,
  type ReceiptFormat,
  type ReceiptVariant,
} from "@/lib/kasse-receipt";

export default function ReceiptPreviewShell({
  belegId,
  variant,
  format,
  returnTo,
  allowPatientCopy,
  autoPrint,
  pendingHinweis,
}: {
  belegId: string;
  variant: ReceiptVariant;
  format: ReceiptFormat;
  returnTo: string | null;
  allowPatientCopy: boolean;
  autoPrint: boolean;
  pendingHinweis: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!autoPrint) return;
    const handle = window.setTimeout(() => window.print(), 140);
    return () => window.clearTimeout(handle);
  }, [autoPrint]);

  const closeReceipt = () => {
    const fallback = returnTo || "/kasse";
    if (typeof window !== "undefined" && window.opener && !window.opener.closed) {
      window.close();
      window.setTimeout(() => router.push(fallback), 160);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallback);
  };

  return (
    <div className="print:hidden">
      <div className="sticky top-0 z-20 border-b border-[#d7dde1] bg-[#10222a]/95 px-4 py-3 text-[#f3efe7] shadow-[0_10px_32px_rgba(16,34,42,0.22)] backdrop-blur">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-3">
          <b className="mr-2 text-sm font-semibold">Vorschau: Praxisquittung</b>
          <span className="text-xs uppercase tracking-[0.18em] text-[#b6c3c8]">Exemplar</span>
          <Link
            href={buildReceiptPreviewHref(belegId, { variant: "praxis", format, returnTo })}
            className={`rounded-full px-4 py-2 text-sm transition ${
              variant === "praxis"
                ? "bg-[#f3efe7] font-semibold text-[#10222a]"
                : "bg-white/10 text-[#f3efe7] hover:bg-white/16"
            }`}
          >
            Praxisexemplar
          </Link>
          {allowPatientCopy ? (
            <Link
              href={buildReceiptPreviewHref(belegId, { variant: "patient", format, returnTo })}
              className={`rounded-full px-4 py-2 text-sm transition ${
                variant === "patient"
                  ? "bg-[#f3efe7] font-semibold text-[#10222a]"
                  : "bg-white/10 text-[#f3efe7] hover:bg-white/16"
              }`}
            >
              Patientenkopie
            </Link>
          ) : (
            <span className="rounded-full border border-[#f2b544]/40 bg-[#f2b544]/10 px-4 py-2 text-sm font-medium text-[#f6d082]">
              Patientenkopie erst nach echtem Geldeingang
            </span>
          )}

          <span className="ml-2 text-xs uppercase tracking-[0.18em] text-[#b6c3c8]">Format</span>
          <Link
            href={buildReceiptPreviewHref(belegId, { variant, format: "a4", returnTo })}
            className={`rounded-full px-4 py-2 text-sm transition ${
              format === "a4"
                ? "bg-[#f3efe7] font-semibold text-[#10222a]"
                : "bg-white/10 text-[#f3efe7] hover:bg-white/16"
            }`}
          >
            A4
          </Link>
          <Link
            href={buildReceiptPreviewHref(belegId, { variant, format: "a5", returnTo })}
            className={`rounded-full px-4 py-2 text-sm transition ${
              format === "a5"
                ? "bg-[#f3efe7] font-semibold text-[#10222a]"
                : "bg-white/10 text-[#f3efe7] hover:bg-white/16"
            }`}
          >
            A5
          </Link>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={closeReceipt}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/16"
            >
              <X size={16} />
              Schließen
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-full bg-[#f2b544] px-4 py-2 text-sm font-semibold text-[#10222a] transition hover:brightness-105"
            >
              <Printer size={16} />
              Drucken
            </button>
            <a
              href={buildReceiptPdfHref(belegId, { variant, format })}
              className="inline-flex items-center gap-2 rounded-full bg-[#f3efe7] px-4 py-2 text-sm font-semibold text-[#10222a] transition hover:brightness-105"
            >
              <Download size={16} />
              Als PDF sichern
            </a>
          </div>
        </div>
        {pendingHinweis ? (
          <div className="mx-auto mt-3 max-w-[1360px] rounded-[14px] border border-[#f2b544]/35 bg-[#f2b544]/10 px-4 py-3 text-sm text-[#f8d489]">
            {pendingHinweis}
          </div>
        ) : null}
      </div>
    </div>
  );
}
