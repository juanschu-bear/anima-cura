import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { fetchIvorisPatientById, updateIvorisPatient, fetchIvorisPatientsPage } from "@/lib/api/ivoris-client";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const confirm = searchParams.get("confirm") === "true";
  const supabase = createServerClient();

  // Only check patients that came through AnimaSign (not all 4600)
  const { data: subs } = await supabase
    .from("anamnese_submissions")
    .select("id, vorname, nachname, geburtsdatum, matched_patient_id, is_existing, account_email")
    .gte("created_at", "2026-06-22T00:00:00Z")
    .order("created_at", { ascending: false });

  if (!subs || subs.length === 0) {
    return NextResponse.json({ message: "Keine Submissions seit 22.06. gefunden." });
  }

  // Get the known ivoris_ids for matched patients
  const patientIds = subs.filter(s => s.matched_patient_id).map(s => s.matched_patient_id as string);
  const { data: ourPatients } = await supabase
    .from("patients")
    .select("id, ivoris_id, vorname, nachname")
    .in("id", patientIds.length > 0 ? patientIds : ["00000000-0000-0000-0000-000000000000"]);

  const idToIvoris = new Map<string, string>();
  if (ourPatients) {
    for (const p of ourPatients) {
      if (p.ivoris_id) idToIvoris.set(p.id, p.ivoris_id);
    }
  }

  // Fetch first 3 pages from Ivoris to find recently added patients (duplicates)
  const ivorisPatients: Array<Record<string, unknown>> = [];
  for (let page = 0; page < 3; page++) {
    try {
      const batch = (await fetchIvorisPatientsPage(page)) as Array<Record<string, unknown>>;
      if (!batch || batch.length === 0) break;
      ivorisPatients.push(...batch);
    } catch {
      break;
    }
  }

  // Find duplicates: for each AnimaSign submission, check if there are multiple
  // Ivoris entries with the same Nachname + Geburtsdatum
  type DupInfo = {
    name: string;
    birthday: string;
    originalIvorisId: string | null;
    duplicateIvorisIds: string[];
    diffs: Array<{ field: string; original: string; duplicate: string }>;
  };

  const duplicates: DupInfo[] = [];

  for (const sub of subs) {
    if (!sub.nachname || !sub.geburtsdatum) continue;

    const nameNorm = (sub.nachname as string).trim().toLowerCase();
    const bday = sub.geburtsdatum as string;

    // Find all Ivoris patients matching this name + birthday
    const matches = ivorisPatients.filter(p =>
      String(p.Lastname || "").trim().toLowerCase() === nameNorm &&
      String(p.Birthday || "") === bday
    );

    if (matches.length >= 2) {
      // We have a duplicate!
      const originalIvorisId = sub.matched_patient_id ? idToIvoris.get(sub.matched_patient_id) || null : null;

      // Original = the one matching our known ivoris_id, or the first one
      let original = matches[0];
      let dups = matches.slice(1);

      if (originalIvorisId) {
        const origIdx = matches.findIndex(m => String(m.Id) === originalIvorisId);
        if (origIdx >= 0) {
          original = matches[origIdx];
          dups = matches.filter((_, i) => i !== origIdx);
        }
      }

      // Check field differences
      const diffs: Array<{ field: string; original: string; duplicate: string }> = [];
      for (const dup of dups) {
        for (const f of ["Email", "Phone", "Mobile"]) {
          const ov = String(original[f] || "").trim();
          const dv = String(dup[f] || "").trim();
          if (ov !== dv && dv.length > 0) {
            diffs.push({ field: f, original: ov, duplicate: dv });
          }
        }
        const oa = (original.Address || {}) as Record<string, string>;
        const da = (dup.Address || {}) as Record<string, string>;
        for (const f of ["Street", "Zip", "City"]) {
          const ov = (oa[f] || "").trim();
          const dv = (da[f] || "").trim();
          if (ov !== dv && dv.length > 0) {
            diffs.push({ field: `Address.${f}`, original: ov, duplicate: dv });
          }
        }
      }

      duplicates.push({
        name: `${sub.vorname} ${sub.nachname}`,
        birthday: bday,
        originalIvorisId: String(original.Id),
        duplicateIvorisIds: dups.map(d => String(d.Id)),
        diffs,
      });
    }
  }

  if (duplicates.length === 0) {
    return NextResponse.json({
      message: "Keine Duplikate in den ersten 3 Seiten von Ivoris gefunden.",
      checkedSubmissions: subs.length,
      ivorisChecked: ivorisPatients.length,
    });
  }

  // PREVIEW
  if (!confirm) {
    return NextResponse.json({
      mode: "PREVIEW",
      duplicateCount: duplicates.length,
      duplicates: duplicates.map(d => ({
        name: d.name,
        birthday: d.birthday,
        originalId: d.originalIvorisId,
        duplicateIds: d.duplicateIvorisIds,
        fieldsToMerge: d.diffs,
        action: d.diffs.length > 0 ? "MERGE dann loeschen" : "Direkt loeschen (identisch)",
      })),
    });
  }

  // MERGE
  const results: Array<{ name: string; action: string; result: string }> = [];

  for (const d of duplicates) {
    if (d.diffs.length > 0 && d.originalIvorisId) {
      const updateData: Record<string, unknown> = {};
      const addrUpdate: Record<string, string> = {};

      for (const diff of d.diffs) {
        if (diff.field.startsWith("Address.")) {
          addrUpdate[diff.field.replace("Address.", "")] = diff.duplicate;
        } else {
          updateData[diff.field] = diff.duplicate;
        }
      }

      if (Object.keys(addrUpdate).length > 0) {
        try {
          const orig = (await fetchIvorisPatientById(d.originalIvorisId)) as Record<string, unknown>;
          const origAddr = (orig.Address || {}) as Record<string, string>;
          updateData.Address = { ...origAddr, ...addrUpdate };
        } catch {
          updateData.Address = addrUpdate;
        }
      }

      try {
        await updateIvorisPatient(d.originalIvorisId, updateData);
        results.push({
          name: d.name,
          action: "MERGED",
          result: `Daten auf Original (${d.originalIvorisId.slice(0, 8)}) uebertragen. Duplikat(e) ${d.duplicateIvorisIds.map(id => id.slice(0, 8)).join(", ")} kann Sabine jetzt loeschen.`,
        });
      } catch (e) {
        results.push({ name: d.name, action: "ERROR", result: String(e).slice(0, 200) });
      }
    } else {
      results.push({
        name: d.name,
        action: "IDENTISCH",
        result: `Keine Datenunterschiede. Duplikat(e) ${d.duplicateIvorisIds.map(id => id.slice(0, 8)).join(", ")} kann direkt geloescht werden.`,
      });
    }
  }

  return NextResponse.json({ mode: "MERGE AUSGEFUEHRT", results });
}
