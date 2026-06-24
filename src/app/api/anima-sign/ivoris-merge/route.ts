import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { fetchIvorisPatientsRaw, updateIvorisPatient, fetchIvorisPatientById } from "@/lib/api/ivoris-client";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const confirm = searchParams.get("confirm") === "true";
  const supabase = createServerClient();

  // 1. Fetch ALL patients from Ivoris
  let allPatients: Array<Record<string, unknown>>;
  try {
    allPatients = (await fetchIvorisPatientsRaw()) as Array<Record<string, unknown>>;
  } catch (e) {
    return NextResponse.json({ error: "Ivoris fetch failed: " + String(e) }, { status: 500 });
  }

  // 2. Group by Nachname + Birthday to find duplicates
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const p of allPatients) {
    const key = `${String(p.Lastname || "").trim().toLowerCase()}|${String(p.Birthday || "")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  // 3. Find duplicates (groups with > 1 entry)
  const duplicates: Array<{
    key: string;
    original: Record<string, unknown>;
    duplicate: Record<string, unknown>;
    diffs: Array<{ field: string; original: unknown; duplicate: unknown }>;
  }> = [];

  // Get our known ivoris_ids from the patients table
  const { data: ourPatients } = await supabase
    .from("patients")
    .select("ivoris_id")
    .not("ivoris_id", "is", null);
  const knownIds = new Set((ourPatients || []).map(p => p.ivoris_id));

  for (const [key, patients] of Array.from(groups.entries())) {
    if (patients.length < 2) continue;

    // Determine which is original: the one we have in our DB, or the older one
    let original = patients[0];
    let dup = patients[1];

    // If one of them is in our known IDs, that's the original
    const origIdx = patients.findIndex(p => knownIds.has(String(p.Id)));
    if (origIdx >= 0) {
      original = patients[origIdx];
      dup = patients[origIdx === 0 ? 1 : 0];
    }

    // Find field differences
    const fieldsToCheck = ["Firstname", "Lastname", "Email", "Phone", "Mobile"];
    const diffs: Array<{ field: string; original: unknown; duplicate: unknown }> = [];
    for (const field of fieldsToCheck) {
      const origVal = String(original[field] || "").trim();
      const dupVal = String(dup[field] || "").trim();
      if (origVal !== dupVal && dupVal.length > 0) {
        diffs.push({ field, original: origVal, duplicate: dupVal });
      }
    }

    // Check Address sub-fields
    const origAddr = (original.Address || {}) as Record<string, string>;
    const dupAddr = (dup.Address || {}) as Record<string, string>;
    for (const f of ["Street", "Zip", "City"]) {
      const ov = (origAddr[f] || "").trim();
      const dv = (dupAddr[f] || "").trim();
      if (ov !== dv && dv.length > 0) {
        diffs.push({ field: `Address.${f}`, original: ov, duplicate: dv });
      }
    }

    duplicates.push({ key, original, duplicate: dup, diffs });
  }

  if (duplicates.length === 0) {
    return NextResponse.json({ message: "Keine Duplikate gefunden.", totalPatients: allPatients.length });
  }

  // PREVIEW mode
  if (!confirm) {
    return NextResponse.json({
      mode: "PREVIEW - nichts geaendert. Mit ?confirm=true ausfuehren.",
      totalPatients: allPatients.length,
      duplicateCount: duplicates.length,
      duplicates: duplicates.map(d => ({
        name: `${d.original.Firstname} ${d.original.Lastname}`,
        birthday: d.original.Birthday,
        originalId: d.original.Id,
        duplicateId: d.duplicate.Id,
        originalInOurDB: knownIds.has(String(d.original.Id)),
        duplicateInOurDB: knownIds.has(String(d.duplicate.Id)),
        fieldsToUpdate: d.diffs,
        action: d.diffs.length > 0
          ? "MERGE: Daten vom Duplikat auf Original uebertragen, dann Duplikat manuell loeschen"
          : "IDENTISCH: Duplikat kann direkt geloescht werden (keine unterschiedlichen Daten)"
      })),
    });
  }

  // MERGE mode
  const results: Array<{ name: string; action: string; result: string }> = [];

  for (const d of duplicates) {
    const name = `${d.original.Firstname} ${d.original.Lastname}`;

    if (d.diffs.length > 0) {
      // Build update payload with the newer data from the duplicate
      const updateData: Record<string, unknown> = {};
      const addressUpdate: Record<string, string> = {};

      for (const diff of d.diffs) {
        if (diff.field.startsWith("Address.")) {
          addressUpdate[diff.field.replace("Address.", "")] = String(diff.duplicate);
        } else {
          updateData[diff.field] = diff.duplicate;
        }
      }

      if (Object.keys(addressUpdate).length > 0) {
        // Merge address: keep original fields, override with duplicate's updated fields
        const origAddr = (d.original.Address || {}) as Record<string, string>;
        updateData.Address = { ...origAddr, ...addressUpdate };
      }

      try {
        await updateIvorisPatient(String(d.original.Id), updateData);
        results.push({
          name,
          action: "MERGED",
          result: `Original ${String(d.original.Id).slice(0, 8)} aktualisiert mit: ${d.diffs.map(dd => dd.field).join(", ")}. Duplikat ${String(d.duplicate.Id).slice(0, 8)} kann jetzt geloescht werden.`,
        });
      } catch (e) {
        results.push({ name, action: "ERROR", result: String(e).slice(0, 200) });
      }
    } else {
      results.push({
        name,
        action: "IDENTISCH",
        result: `Keine Datenunterschiede. Duplikat ${String(d.duplicate.Id).slice(0, 8)} kann direkt geloescht werden.`,
      });
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return NextResponse.json({
    mode: "MERGE AUSGEFUEHRT",
    totalPatients: allPatients.length,
    mergedCount: results.length,
    results,
    hinweis: "Die Duplikate muessen jetzt von Sabine manuell in Ivoris geloescht werden. Die Daten wurden bereits auf die Originale uebertragen.",
  });
}
