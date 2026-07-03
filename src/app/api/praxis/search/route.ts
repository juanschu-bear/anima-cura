import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePatientSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildSearchVariants(input: string) {
  const base = normalizePatientSearch(input);
  const compact = base.replace(/\s+/g, " ").trim();
  const variants = new Set<string>([compact]);
  if (compact.includes("ae")) variants.add(compact.replace(/ae/g, "a"));
  if (compact.includes("oe")) variants.add(compact.replace(/oe/g, "o"));
  if (compact.includes("ue")) variants.add(compact.replace(/ue/g, "u"));
  if (compact.includes("ss")) variants.add(compact.replace(/ss/g, "s"));
  return Array.from(variants).filter(Boolean);
}

function rankPatientMatch(patient: any, search: string) {
  const variants = buildSearchVariants(search);
  const fullName = normalizePatientSearch(`${patient.nachname ?? ""} ${patient.vorname ?? ""}`);
  const reversedName = normalizePatientSearch(`${patient.vorname ?? ""} ${patient.nachname ?? ""}`);
  const lastName = normalizePatientSearch(patient.nachname ?? "");
  const firstName = normalizePatientSearch(patient.vorname ?? "");
  const patientNumber = String(patient.ivoris_nummer ?? "").toLowerCase();

  let best = Number.POSITIVE_INFINITY;
  for (const variant of variants) {
    if (patientNumber && patientNumber === variant) best = Math.min(best, 0);
    else if (lastName && lastName === variant) best = Math.min(best, 1);
    else if (fullName && fullName === variant) best = Math.min(best, 2);
    else if (reversedName && reversedName === variant) best = Math.min(best, 3);
    else if (patientNumber && patientNumber.includes(variant)) best = Math.min(best, 4);
    else if (lastName && lastName.startsWith(variant)) best = Math.min(best, 5);
    else if (fullName && fullName.startsWith(variant)) best = Math.min(best, 6);
    else if (reversedName && reversedName.startsWith(variant)) best = Math.min(best, 7);
    else if (lastName && lastName.includes(variant)) best = Math.min(best, 8);
    else if (firstName && firstName.includes(variant)) best = Math.min(best, 9);
    else if (fullName && fullName.includes(variant)) best = Math.min(best, 10);
    else if (reversedName && reversedName.includes(variant)) best = Math.min(best, 11);
  }

  return best;
}

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id")?.trim();
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  const sc = createServerClient();

  if (id) {
    const { data: patient } = await sc
      .from("patients")
      .select("id, ivoris_nummer, vorname, nachname, geschlecht, geburtsdatum, behandlung, kasse, telefon, mobiltelefon, email, strasse, plz, ort")
      .eq("id", id)
      .maybeSingle();

    return NextResponse.json({
      results: patient
        ? [{
            id: patient.id,
            ivoris_nummer: patient.ivoris_nummer ?? null,
            vorname: patient.vorname ?? "",
            nachname: patient.nachname ?? "",
            name: `${patient.vorname ?? ""} ${patient.nachname ?? ""}`.trim(),
            geschlecht: patient.geschlecht ?? null,
            geburtsdatum: patient.geburtsdatum ?? null,
            behandlung: patient.behandlung ?? null,
            kasse: patient.kasse ?? null,
            telefon: patient.telefon ?? "",
            mobiltelefon: patient.mobiltelefon ?? "",
            email: patient.email ?? "",
            strasse: patient.strasse ?? null,
            plz: patient.plz ?? null,
            ort: patient.ort ?? null,
          }]
        : [],
    });
  }

  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const teile = buildSearchVariants(q);
  const muster = Array.from(new Set(teile.flatMap((teil) => [
    `vorname.ilike.%${teil}%`,
    `nachname.ilike.%${teil}%`,
    `email.ilike.%${teil}%`,
    `ivoris_nummer.ilike.%${teil}%`,
  ]))).join(",");

  const { data: patients } = await sc
    .from("patients")
    .select("id, ivoris_nummer, vorname, nachname, geschlecht, geburtsdatum, behandlung, kasse, telefon, mobiltelefon, email, strasse, plz, ort")
    .or(muster)
    .limit(40);

  const treffer = (patients || []).filter((patient) => {
    const fullName = normalizePatientSearch(`${patient.nachname ?? ""} ${patient.vorname ?? ""}`);
    const reversedName = normalizePatientSearch(`${patient.vorname ?? ""} ${patient.nachname ?? ""}`);
    const email = normalizePatientSearch(patient.email ?? "");
    const patientNumber = String(patient.ivoris_nummer ?? "").toLowerCase();
    return teile.every((teil) =>
      fullName.includes(teil) ||
      reversedName.includes(teil) ||
      email.includes(teil) ||
      patientNumber.includes(teil)
    );
  });

  treffer.sort((a, b) => {
    const rankA = rankPatientMatch(a, q);
    const rankB = rankPatientMatch(b, q);
    if (rankA !== rankB) return rankA - rankB;
    const lastNameCompare = String(a.nachname ?? "").localeCompare(String(b.nachname ?? ""), "de");
    if (lastNameCompare !== 0) return lastNameCompare;
    return String(a.vorname ?? "").localeCompare(String(b.vorname ?? ""), "de");
  });

  return NextResponse.json({
    results: treffer.slice(0, 8).map(p => ({
      id: p.id,
      ivoris_nummer: p.ivoris_nummer ?? null,
      vorname: p.vorname ?? "",
      nachname: p.nachname ?? "",
      name: `${p.vorname ?? ""} ${p.nachname ?? ""}`.trim(),
      geschlecht: p.geschlecht ?? null,
      behandlung: p.behandlung ?? null,
      kasse: p.kasse ?? null,
      email: p.email || "",
      telefon: p.telefon || "",
      mobiltelefon: p.mobiltelefon || "",
      geburtsdatum: p.geburtsdatum || null,
      strasse: p.strasse ?? null,
      plz: p.plz ?? null,
      ort: p.ort ?? null,
    })),
  });
}
