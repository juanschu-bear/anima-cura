import { redirect } from "next/navigation";
import {
  buildReceiptPreviewHref,
  parseReceiptFormat,
  parseReceiptVariant,
  sanitizeReturnTo,
} from "@/lib/kasse-receipt";

export default function LegacyReceiptRedirect({
  searchParams,
}: {
  searchParams: {
    id?: string;
    copy?: string;
    variant?: string;
    format?: string;
    returnTo?: string;
  };
}) {
  const id = typeof searchParams.id === "string" ? searchParams.id : "";
  if (!id) {
    redirect("/kasse");
  }

  const variant =
    searchParams.copy === "patient"
      ? "patient"
      : parseReceiptVariant(typeof searchParams.variant === "string" ? searchParams.variant : undefined);
  const format = parseReceiptFormat(typeof searchParams.format === "string" ? searchParams.format : undefined);
  const returnTo = sanitizeReturnTo(typeof searchParams.returnTo === "string" ? searchParams.returnTo : undefined);

  redirect(buildReceiptPreviewHref(id, { variant, format, returnTo }));
}
