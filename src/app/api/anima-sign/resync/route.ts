import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { updateIvorisPatient } from "@/lib/api/ivoris-client";
import { addIvorisDocument } from "@/lib/api/ivoris-doku-client";

export const maxDuration = 60;

export async function POST() {
  const supabase = createServerClient();
  const results: Array<{ name: string; patient_sync: string; doc_sync: string }> = [];

  const { data: failed } = await supabase
    .from("anamnese_submissions")
    .select("id, vorname, nachname, email, answers, is_existing, matched_patient_id, signed_pdf_path, ivoris_doc_synced")
    .eq("ivoris_synced", false)
    .not("ivoris_sync_error", "is", null)
    .order("created_at", { ascending: true });

  if (!failed || failed.length === 0) {
    return NextResponse.json({ message: "Keine fehlgeschlagenen Syncs", results: [] });
  }

  for (const sub of failed) {
    const name = [sub.vorname, sub.nachname].filter(Boolean).join(" ").trim();
    const entry: { name: string; patient_sync: string; doc_sync: string } = {
      name,
      patient_sync: "skipped",
      doc_sync: "skipped",
    };

    if (sub.is_existing && sub.matched_patient_id) {
      const { data: pat } = await supabase
        .from("patients")
        .select("ivoris_id")
        .eq("id", sub.matched_patient_id)
        .maybeSingle();

      if (pat?.ivoris_id && typeof pat.ivoris_id === "string" && pat.ivoris_id.length > 10) {
        try {
          const answers = (sub.answers || {}) as Record<string, unknown>;
          const contactUpdate = {
            Email: (sub.email as string) || "",
            Phone: (answers.patient_telefon as string) || "",
            Mobile: (answers.patient_mobil as string) || "",
            Address: {
              Street: [answers.patient_strasse, answers.patient_hausnummer].filter(Boolean).join(" "),
              Zip: (answers.patient_plz as string) || "",
              City: (answers.patient_wohnort as string) || "",
              Country: "D",
            },
          };

          await updateIvorisPatient(pat.ivoris_id, contactUpdate);
          await supabase
            .from("anamnese_submissions")
            .update({ ivoris_synced: true, ivoris_sync_error: null })
            .eq("id", sub.id);
          entry.patient_sync = "success";
        } catch (err) {
          entry.patient_sync = `error: ${String(err).slice(0, 100)}`;
        }
      } else {
        entry.patient_sync = "no_ivoris_id";
      }
    } else {
      entry.patient_sync = "neupatient_skipped";
    }

    if (!sub.ivoris_doc_synced && sub.signed_pdf_path && sub.matched_patient_id) {
      const { data: pat } = await supabase
        .from("patients")
        .select("ivoris_id")
        .eq("id", sub.matched_patient_id)
        .maybeSingle();

      if (pat?.ivoris_id && typeof pat.ivoris_id === "string" && pat.ivoris_id.length > 10) {
        try {
          const { data: fileData } = await supabase.storage
            .from("anamnese-dokumente")
            .download(sub.signed_pdf_path);

          if (fileData) {
            const buffer = Buffer.from(await fileData.arrayBuffer());
            const base64 = buffer.toString("base64");

            await addIvorisDocument({
              
              patientIvorisId: pat.ivoris_id,
              name: `Anamnesebogen_${name.replace(/\s/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`,
              date: new Date().toISOString().split("T")[0],
              contentBase64: base64,
            });

            await supabase
              .from("anamnese_submissions")
              .update({ ivoris_doc_synced: true })
              .eq("id", sub.id);
            entry.doc_sync = "success";
          } else {
            entry.doc_sync = "pdf_download_failed";
          }
        } catch (err) {
          entry.doc_sync = `error: ${String(err).slice(0, 100)}`;
        }
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
