import { createServerClient } from "@/lib/db/supabase";

// ============================================================
// AnimaHost Memory Service
// Liest und schreibt Patient-Memories fur den Avatar.
// ============================================================

export interface PatientMemory {
  memories: Array<{
    zusammenfassung: string;
    offene_themen: string[];
    stimmung: string | null;
    datum: string;
    besuche_nummer: number;
  }>;
  preferences: {
    kommunikationsstil: string | null;
    sprache: string;
    bekannte_muster: string[];
    familie_kontext: string | null;
    notizen: string | null;
    besuche_gesamt: number;
    letzter_besuch: string | null;
  } | null;
}

export async function readPatientMemory(patientId: string): Promise<PatientMemory | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("animahost_memory_read", {
    p_patient_id: patientId,
  });

  if (error || !data) return null;
  return data as PatientMemory;
}

export function formatMemoryForPrompt(memory: PatientMemory): string {
  const lines: string[] = [];

  if (memory.preferences) {
    const p = memory.preferences;
    lines.push(`Besuch Nummer: ${p.besuche_gesamt}`);
    if (p.letzter_besuch) lines.push(`Letzter Besuch: ${p.letzter_besuch}`);
    if (p.kommunikationsstil) lines.push(`Kommunikationsstil: ${p.kommunikationsstil}`);
    if (p.familie_kontext) lines.push(`Familie: ${p.familie_kontext}`);
    if (p.bekannte_muster.length > 0) {
      lines.push(`Bekannte Muster: ${p.bekannte_muster.join(", ")}`);
    }
  }

  if (memory.memories.length > 0) {
    lines.push("");
    lines.push("Letzte Besuche:");
    for (const m of memory.memories) {
      lines.push(`- ${m.datum}: ${m.zusammenfassung}`);
      if (m.offene_themen.length > 0) {
        lines.push(`  Offene Themen: ${m.offene_themen.join(", ")}`);
      }
    }
  }

  return lines.join("\n");
}

export async function writePatientMemory(params: {
  patientId: string;
  patientName: string;
  zusammenfassung: string;
  offeneThemen?: string[];
  stimmung?: string;
  praeferenzUpdates?: string[];
  kommunikationsstil?: string;
  familieKontext?: string;
}): Promise<void> {
  const supabase = createServerClient();

  await supabase.rpc("animahost_memory_write", {
    p_patient_id: params.patientId,
    p_patient_name: params.patientName,
    p_zusammenfassung: params.zusammenfassung,
    p_offene_themen: params.offeneThemen || [],
    p_stimmung: params.stimmung || null,
    p_praeferenz_updates: params.praeferenzUpdates || [],
    p_kommunikationsstil: params.kommunikationsstil || null,
    p_familie_kontext: params.familieKontext || null,
  });
}
