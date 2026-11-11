import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { prepareScribeBillingExport } from "@/lib/billing-foundation";
import { t } from "@/lib/i18n";
import { checkScribeConsistency } from '@/lib/scribe-consistency-service';
import { createServerClient } from '@/lib/db/supabase';
import {storedConsistencyAudit} from '@/lib/scribe-consistency-acknowledgement';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code:"not_authenticated",error: "Nicht autorisiert" }, { status: 401 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single();
  const permissions = (profile?.permissions ?? {}) as { scribe_schreiben?: boolean };
  const allowed = permissions.scribe_schreiben ?? ["admin", "verwaltung"].includes(profile?.role ?? "");
  if (!allowed) return NextResponse.json({ code:"scribe_forbidden",error: "Keine Berechtigung" }, { status: 403 });

  const { data: entry, error } = await supabase
    .from("doku_eintraege")
    .select("id, version, status, bestaetigt_am, bestaetigt_kuerzel, positionen, vorlage_id, behandlungsart, termin_typ, text, auswahl, variablen, zaehne")
    .eq("id", params.id)
    .single();
  if (error || !entry) return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });
  if (entry.status !== "bestaetigt" || !entry.bestaetigt_am) {
    return NextResponse.json({ error: "Nur bestätigte, versionierte Einträge dürfen exportiert werden" }, { status: 409 });
  }

  const locale = new URL(_request.url).searchParams.get("lang") === "en" ? "en" : "de";
  // Existing confirmed entries also need a current consistency check. Reading
  // them never repairs history or re-confirms a financial entitlement.
  const check = await checkScribeConsistency(supabase, entry, {
    confirmedAt: entry.bestaetigt_am,
    // The immutable option ledger is server-only. Authentication and the
    // practice permission check above always happen before this read.
    historyDb: createServerClient(),
  });
  // A confirmed clinical record remains usable evidence. Later template damage
  // or an acknowledged warning is shown in the export, never used to erase the
  // practice's earlier decision.
  const storedAudit=storedConsistencyAudit(entry.variablen);
  const confirmation=storedAudit??(!check.canConfirm?{
    code:'confirmed_despite_warning' as const,
    fingerprint:null,
    confirmedBy:{id:null,name:entry.bestaetigt_kuerzel||'Praxis'},
    confirmedAt:entry.bestaetigt_am,
    issues:check.issues,
  }:null);
  const prepared = prepareScribeBillingExport(entry.positionen);
  if (!prepared.ok) return NextResponse.json({
    status: "needs_position_review",
    error: t("billing.exportReview", locale),
  }, { status: 409, headers: { "Cache-Control": "private, no-store" } });

  return NextResponse.json({
    status: "manual_transfer_required",
    source_entry_id: entry.id,
    source_version: entry.version,
    confirmed_at: entry.bestaetigt_am,
    positions: prepared.positions,
    copy_text: prepared.copyText,
    consistencyWarnings:check.canConfirm?[]:check.issues,
    confirmation,
    confirmationLabel:confirmation?`Trotz Hinweis von ${confirmation.confirmedBy.name} bestätigt`:null,
    notice: "Noch keine bestätigte IVORIS-Abrechnungsschnittstelle. Positionen fachlich prüfen und manuell in IVORIS erfassen.",
  }, { headers: { "Cache-Control": "private, no-store" } });
}
