import { JetBrains_Mono, Manrope } from "next/font/google";
import { notFound, redirect } from "next/navigation";
import ReceiptPrintDocument from "@/components/kasse/ReceiptPrintDocument";
import ReceiptPreviewShell from "@/components/kasse/ReceiptPreviewShell";
import { canAccessPath, getDefaultDashboardPath } from "@/lib/auth";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";
import {
  buildReceiptPreviewHref,
  canRenderPatientReceipt,
  loadKassenBeleg,
  parseReceiptFormat,
  parseReceiptVariant,
  sanitizeReturnTo,
} from "@/lib/kasse-receipt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-receipt-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-receipt-mono",
  display: "swap",
});

export default async function ReceiptPrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    variant?: string;
    format?: string;
    returnTo?: string;
    autoPrint?: string;
    mode?: string;
  };
}) {
  const user = await getAuthenticatedAppUser();
  const nextHref = buildReceiptPreviewHref(params.id, {
    variant: parseReceiptVariant(searchParams.variant),
    format: parseReceiptFormat(searchParams.format),
  });

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextHref)}`);
  }
  if (user.role === "patient") {
    redirect("/patient/portal");
  }
  if (!canAccessPath(user.role, "/kasse", user.permissions)) {
    redirect(getDefaultDashboardPath(user.role));
  }

  const beleg = await loadKassenBeleg(params.id);
  if (!beleg) notFound();

  const format = parseReceiptFormat(searchParams.format);
  const requestedVariant = parseReceiptVariant(searchParams.variant);
  const variant = canRenderPatientReceipt(beleg) ? requestedVariant : "praxis";
  const returnTo = sanitizeReturnTo(searchParams.returnTo);
  const pdfMode = searchParams.mode === "pdf";
  const autoPrint = searchParams.autoPrint === "1" && !pdfMode;
  const pendingHinweis =
    !canRenderPatientReceipt(beleg) && beleg.buchungstyp !== "ausgabe"
      ? "Diese Zahlung ist erst vorgemerkt. Eine Patientenkopie wird aus Sicherheitsgründen erst freigegeben, sobald der echte Geldeingang im Praxiskonto verbucht ist."
      : null;

  return (
    <div
      className={`${manrope.variable} ${jetbrainsMono.variable} min-h-screen ${pdfMode ? "bg-white" : "bg-[radial-gradient(circle_at_top,_#dce8ff_0%,_#edf2f8_38%,_#e7ecef_100%)]"}`}
    >
      {!pdfMode ? (
        <ReceiptPreviewShell
          belegId={beleg.id}
          variant={variant}
          format={format}
          returnTo={returnTo}
          allowPatientCopy={canRenderPatientReceipt(beleg)}
          autoPrint={autoPrint}
          pendingHinweis={pendingHinweis}
        />
      ) : null}

      <div className={`${pdfMode ? "" : "overflow-x-auto px-4 py-6"} print:p-0`}>
        <div className={`${pdfMode ? "" : "flex min-w-max justify-center"} print:block`}>
          <ReceiptPrintDocument beleg={beleg} variant={variant} format={format} />
        </div>
      </div>
    </div>
  );
}
