import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const serviceClient = createServerClient();
  const url = request.nextUrl;
  const von = url.searchParams.get("von") || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const bis = url.searchParams.get("bis") || new Date().toISOString().slice(0, 10);
  const vergleichVon = url.searchParams.get("vergleich_von") || null;
  const vergleichBis = url.searchParams.get("vergleich_bis") || null;

  async function getStats(from: string, to: string) {
    // Bezahlte Raten im Zeitraum
    const { data: bezahlt } = await serviceClient
      .from("raten")
      .select("id, betrag, bezahlt_betrag, faellig_am, bezahlt_am, mahnstufe, patient_id")
      .eq("status", "bezahlt")
      .gte("bezahlt_am", from)
      .lte("bezahlt_am", to);

    // Fällige Raten im Zeitraum (alle die fällig waren)
    const { data: faellig } = await serviceClient
      .from("raten")
      .select("id, betrag, faellig_am, status, bezahlt_am, mahnstufe, patient_id")
      .gte("faellig_am", from)
      .lte("faellig_am", to);

    // Überfällige Raten (aktuell)
    const { data: ueberfaellig } = await serviceClient
      .from("raten")
      .select("id, betrag, faellig_am, patient_id, mahnstufe")
      .eq("status", "überfällig");

    // Aktive Ratenpläne
    const { count: aktivePlaene } = await serviceClient
      .from("ratenplaene")
      .select("id", { count: "exact", head: true })
      .eq("status", "aktiv");

    // Mahnungen im Zeitraum
    const { data: mahnungen } = await serviceClient
      .from("raten")
      .select("id, mahnstufe, faellig_am")
      .gt("mahnstufe", 0)
      .gte("faellig_am", from)
      .lte("faellig_am", to);

    const bezahltArr = bezahlt || [];
    const faelligArr = faellig || [];
    const ueberfaelligArr = ueberfaellig || [];
    const mahnungenArr = mahnungen || [];

    // Einnahmen
    const einnahmen = bezahltArr.reduce((s, r) => s + Number(r.bezahlt_betrag || r.betrag || 0), 0);

    // Zahlungsquote
    const faelligCount = faelligArr.length;
    const bezahltCount = faelligArr.filter(r => r.status === "bezahlt").length;
    const zahlungsquote = faelligCount > 0 ? Math.round((bezahltCount / faelligCount) * 100) : 100;

    // Durchschnittliche Verzögerung
    const verzoegerungen = bezahltArr
      .filter(r => r.faellig_am && r.bezahlt_am)
      .map(r => Math.max(0, Math.floor((new Date(r.bezahlt_am).getTime() - new Date(r.faellig_am).getTime()) / 864e5)));
    const avgVerzoegerung = verzoegerungen.length > 0 ? Math.round(verzoegerungen.reduce((s, v) => s + v, 0) / verzoegerungen.length * 10) / 10 : 0;

    // Mahnquote
    const mahnquote = faelligCount > 0 ? Math.round((mahnungenArr.length / faelligCount) * 100) : 0;

    // Offene Posten
    const offenePosten = ueberfaelligArr.reduce((s, r) => s + Number(r.betrag || 0), 0);

    // Pünktlich / Verspätet / Überfällig Verteilung
    const puenktlich = faelligArr.filter(r => r.status === "bezahlt" && r.bezahlt_am && r.faellig_am && (new Date(r.bezahlt_am).getTime() - new Date(r.faellig_am).getTime()) <= 3 * 864e5).length;
    const verspaetet = faelligArr.filter(r => r.status === "bezahlt" && r.bezahlt_am && r.faellig_am && (new Date(r.bezahlt_am).getTime() - new Date(r.faellig_am).getTime()) > 3 * 864e5).length;
    const ueberfaelligCount = faelligArr.filter(r => r.status === "überfällig").length;
    const offenCount = faelligArr.filter(r => r.status === "offen").length;

    // Monatliche Einnahmen (für Liniendiagramm)
    const monatlich: Record<string, { einnahmen: number; geplant: number }> = {};
    bezahltArr.forEach(r => {
      const m = r.bezahlt_am?.slice(0, 7);
      if (m) { if (!monatlich[m]) monatlich[m] = { einnahmen: 0, geplant: 0 }; monatlich[m].einnahmen += Number(r.bezahlt_betrag || r.betrag || 0); }
    });
    faelligArr.forEach(r => {
      const m = r.faellig_am?.slice(0, 7);
      if (m) { if (!monatlich[m]) monatlich[m] = { einnahmen: 0, geplant: 0 }; monatlich[m].geplant += Number(r.betrag || 0); }
    });

    // Mahnstufen-Verteilung
    const mahnstufen = { stufe1: 0, stufe2: 0, stufe3: 0 };
    mahnungenArr.forEach(m => {
      if (m.mahnstufe === 1) mahnstufen.stufe1++;
      else if (m.mahnstufe === 2) mahnstufen.stufe2++;
      else if (m.mahnstufe >= 3) mahnstufen.stufe3++;
    });

    // Top offene Posten
    const topOffene = ueberfaelligArr
      .sort((a, b) => Number(b.betrag) - Number(a.betrag))
      .slice(0, 5);

    // Patient-Namen für Top-Liste
    const patientIds = Array.from(new Set(topOffene.map(r => r.patient_id)));
    const { data: patienten } = await serviceClient
      .from("patients")
      .select("id, vorname, nachname")
      .in("id", patientIds.length > 0 ? patientIds : ["00000000-0000-0000-0000-000000000000"]);

    const patMap: Record<string, string> = {};
    (patienten || []).forEach(p => { patMap[p.id] = `${p.nachname}, ${p.vorname}`; });

    return {
      einnahmen,
      zahlungsquote,
      avgVerzoegerung,
      mahnquote,
      aktivePlaene: aktivePlaene || 0,
      offenePosten,
      bezahltCount,
      faelligCount,
      verteilung: { puenktlich, verspaetet, ueberfaellig: ueberfaelligCount, offen: offenCount },
      monatlich: Object.entries(monatlich).sort((a, b) => a[0].localeCompare(b[0])).map(([monat, data]) => ({ monat, ...data })),
      mahnstufen,
      topOffene: topOffene.map(r => ({ ...r, betrag: Number(r.betrag), patient_name: patMap[r.patient_id] || "Unbekannt" })),
    };
  }

  const aktuell = await getStats(von, bis);

  let vergleich = null;
  if (vergleichVon && vergleichBis) {
    vergleich = await getStats(vergleichVon, vergleichBis);
  }

  // Prognose: nächste 3 Monate
  const heute = new Date();
  const prognoseMonths = [];
  for (let i = 1; i <= 3; i++) {
    const m = new Date(heute.getFullYear(), heute.getMonth() + i, 1);
    const mEnd = new Date(heute.getFullYear(), heute.getMonth() + i + 1, 0);
    const { data: upcoming } = await serviceClient
      .from("raten")
      .select("id, betrag")
      .eq("status", "offen")
      .gte("faellig_am", m.toISOString().slice(0, 10))
      .lte("faellig_am", mEnd.toISOString().slice(0, 10));

    const sum = (upcoming || []).reduce((s, r) => s + Number(r.betrag || 0), 0);
    const count = (upcoming || []).length;
    prognoseMonths.push({
      monat: m.toISOString().slice(0, 7),
      erwartet: sum,
      raten: count,
      bestCase: sum,
      worstCase: Math.round(sum * (aktuell.zahlungsquote / 100)),
    });
  }

  return NextResponse.json({
    zeitraum: { von, bis },
    aktuell,
    vergleich,
    prognose: prognoseMonths,
  });
}
