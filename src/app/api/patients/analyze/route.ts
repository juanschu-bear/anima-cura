import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";

export async function GET() {
  const db = createServerClient();
  const results: Record<string, unknown> = {};

  const { count: total } = await db.from("patients").select("*", { count: "exact", head: true });
  results.total = total;

  const { data: allPatients } = await db
    .from("patients")
    .select("id, vorname, nachname, geburtsdatum, geschlecht, kasse, behandlung, behandlung_start, behandlung_status, email, telefon, plz, ort, created_at");

  if (!allPatients) {
    return NextResponse.json({ error: "Could not fetch patients" }, { status: 500 });
  }

  const behandlungCounts: Record<string, number> = {};
  for (const p of allPatients) {
    const key = p.behandlung || "(leer)";
    behandlungCounts[key] = (behandlungCounts[key] || 0) + 1;
  }
  results.behandlung_verteilung = Object.entries(behandlungCounts).sort((a, b) => b[1] - a[1]);

  const statusCounts: Record<string, number> = {};
  for (const p of allPatients) {
    const key = p.behandlung_status || "(leer)";
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }
  results.behandlung_status = statusCounts;

  const genderCounts: Record<string, number> = {};
  for (const p of allPatients) {
    const key = p.geschlecht || "(leer)";
    genderCounts[key] = (genderCounts[key] || 0) + 1;
  }
  results.geschlecht = genderCounts;

  const kasseCounts: Record<string, number> = {};
  for (const p of allPatients) {
    const key = p.kasse || "(leer)";
    kasseCounts[key] = (kasseCounts[key] || 0) + 1;
  }
  results.kasse = kasseCounts;

  const seen = new Map<string, any[]>();
  for (const p of allPatients) {
    const key = `${(p.vorname || "").toLowerCase().trim()}|${(p.nachname || "").toLowerCase().trim()}|${p.geburtsdatum}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push({ id: p.id, vorname: p.vorname, nachname: p.nachname, geburtsdatum: p.geburtsdatum, behandlung: p.behandlung });
  }
  const duplicates = Array.from(seen.entries())
    .filter(([, v]) => v.length > 1)
    .map(([key, patients]) => ({ key, count: patients.length, patients }));
  results.duplikate = { anzahl_gruppen: duplicates.length, details: duplicates };

  let withEmail = 0, withPhone = 0, withAddress = 0;
  for (const p of allPatients) {
    if (p.email) withEmail++;
    if (p.telefon) withPhone++;
    if (p.plz && p.ort) withAddress++;
  }
  results.datenqualitaet = {
    mit_email: withEmail,
    mit_telefon: withPhone,
    mit_adresse: withAddress,
    ohne_email: (total || 0) - withEmail,
    ohne_telefon: (total || 0) - withPhone,
  };

  const startYears: Record<string, number> = {};
  let noStart = 0;
  const today = new Date().toISOString().slice(0, 10);
  let startIsToday = 0;
  for (const p of allPatients) {
    if (!p.behandlung_start) { noStart++; continue; }
    if (p.behandlung_start === today) startIsToday++;
    const year = p.behandlung_start.slice(0, 4);
    startYears[year] = (startYears[year] || 0) + 1;
  }
  results.behandlung_start_jahre = Object.entries(startYears).sort((a, b) => a[0].localeCompare(b[0]));
  results.behandlung_start_fehlt = noStart;
  results.behandlung_start_ist_heute = startIsToday;

  const cityCounts: Record<string, number> = {};
  for (const p of allPatients) {
    const key = (p.ort || "(leer)").trim();
    cityCounts[key] = (cityCounts[key] || 0) + 1;
  }
  results.staedte_top10 = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return NextResponse.json(results, { status: 200 });
}
