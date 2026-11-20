import type { Metadata } from "next";
import { InvoiceRecipientConfirm } from "@/components/patient/AnimaHostSelfService";

// Das Öffnen allein ändert nichts. Der Code steht hinter dem # und geht erst beim Klick im Body an den Server.
export const metadata: Metadata = { title: "Anima Cura", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default function InvoiceRecipientPage() {
  return <InvoiceRecipientConfirm />;
}
