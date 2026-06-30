import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { syncAnimaSignSubmission } from "@/lib/services/animasign-ivoris-sync";

export const maxDuration = 60;


export async function POST(req: Request) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "5", 10);
  const supabase = createServerClient();
  const results: Array<{ id: string; name: string; patient_sync: string; doc_sync: string }> = [];

  const { data: failed } = await supabase
    .from("anamnese_submissions")
    .select("id, vorname, nachname, signed_pdf_path, ivoris_synced, ivoris_doc_synced")
    .or("ivoris_synced.eq.false,ivoris_doc_synced.eq.false")
    .order("created_at", { ascending: true }).limit(limit);

  if (!failed || failed.length === 0) {
    return NextResponse.json({ message: "Keine fehlgeschlagenen Syncs", results: [] });
  }

  for (const sub of failed) {
    const name = [sub.vorname, sub.nachname].filter(Boolean).join(" ").trim();
    const entry: { id: string; name: string; patient_sync: string; doc_sync: string } = {
      id: sub.id,
      name,
      patient_sync: "skipped",
      doc_sync: "skipped",
    };

    const stages = [
      ...(sub.ivoris_synced === false ? (["patient"] as const) : []),
      ...(sub.ivoris_doc_synced === false && sub.signed_pdf_path ? (["document"] as const) : []),
    ];

    if (!stages.length) {
      results.push(entry);
      continue;
    }

    const syncResult = await syncAnimaSignSubmission(sub.id, {
      db: supabase,
      stages: [...stages],
    });

    entry.patient_sync = syncResult.patient;
    entry.doc_sync = syncResult.document;

    if (syncResult.errors.length > 0) {
      if (entry.patient_sync === "error") {
        entry.patient_sync = `error: ${syncResult.errors.join(" | ").slice(0, 160)}`;
      }
      if (entry.doc_sync === "error") {
        entry.doc_sync = `error: ${syncResult.errors.join(" | ").slice(0, 160)}`;
      }
    }

    results.push(entry);
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({
    total: results.length,
    patient_synced: results.filter((r) => r.patient_sync === "success").length,
    doc_synced: results.filter((r) => r.doc_sync === "success").length,
    results,
  });
}
