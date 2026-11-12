import { Suspense } from "react";
import type { Metadata } from "next";
import InvoiceAccessContinue from "@/components/patient/InvoiceAccessContinue";

// Öffnen allein verändert nichts (auch nicht durch Mail-Scanner). Erst „Zugang aktivieren“ sendet.
export const metadata: Metadata = { title: "Anima Cura", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default function InvoiceAccessContinuePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", background: "#05070b" }} />}>
      <InvoiceAccessContinue />
    </Suspense>
  );
}
