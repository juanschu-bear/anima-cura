import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const sc = createServerClient();
  const url = request.nextUrl;
  const von = url.searchParams.get("von") || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const bis = url.searchParams.get("bis") || new Date().toISOString().slice(0, 10);
  const vVon = url.searchParams.get("vergleich_von") || null;
  const vBis = url.searchParams.get("vergleich_bis") || null;

  async function getStats(from: string, to: string) {
    const [{ data: bezahlt }, { data: faellig }, { data: ueberfaellig }, { count: aktivePlaene }, { data: mahnungen }] = await Promise.all([
      sc.from("raten").select("id, betrag, bezahlt_betrag, faellig_am, bezahlt_am, mahnstufe, patient_id").eq("status", "bezahlt").gte("bezahlt_am", from).lte("bezahlt_am", to),
      sc.from("raten").select("id, betrag, faellig_am, status, bezahlt_am, mahnstufe, patient_id").gte("faellig_am", from).lte("faellig_am", to),
      sc.from("raten").select("id, betrag, faellig_am, patient_id, mahnstufe").eq("status", "überfällig"),
      sc.from("ratenplaene").select("id", { count: "exact", head: true }).eq("status", "aktiv"),
      sc.from("raten").select("id, mahnstufe, faellig_am").gt("mahnstufe", 0).gte("faellig_am", from).lte("faellig_am", to),
    ]);

    const bArr = bezahlt || [], fArr = faellig || [], uArr = ueberfaellig || [], mArr = mahnungen || [];

    // Core KPIs
    const einnahmen = bArr.reduce((s, r) => s + Number(r.bezahlt_betrag || r.betrag || 0), 0);
    const uniquePatients = new Set(bArr.map(r => r.patient_id));
    const einnahmenProKopf = uniquePatients.size > 0 ? Math.round(einnahmen / uniquePatients.size) : 0;
    const bezahltCount = fArr.filter(r => r.status === "bezahlt").length;
    const faelligCount = fArr.length;
    const zahlungsquote = faelligCount > 0 ? Math.round((bezahltCount / faelligCount) * 100) : 100;

    const verz = bArr.filter(r => r.faellig_am && r.bezahlt_am).map(r => Math.max(0, Math.floor((new Date(r.bezahlt_am).getTime() - new Date(r.faellig_am).getTime()) / 864e5)));
    const avgVerzoegerung = verz.length > 0 ? Math.round(verz.reduce((s, v) => s + v, 0) / verz.length * 10) / 10 : 0;
    const mahnquote = faelligCount > 0 ? Math.round((mArr.length / faelligCount) * 100) : 0;
    const offenePosten = uArr.reduce((s, r) => s + Number(r.betrag || 0), 0);

    // Zahlungsstatus-Verteilung
    const puenktlich = fArr.filter(r => r.status === "bezahlt" && r.bezahlt_am && r.faellig_am && (new Date(r.bezahlt_am).getTime() - new Date(r.faellig_am).getTime()) <= 3 * 864e5).length;
    const verspaetet = fArr.filter(r => r.status === "bezahlt" && r.bezahlt_am && r.faellig_am && (new Date(r.bezahlt_am).getTime() - new Date(r.faellig_am).getTime()) > 3 * 864e5).length;
    const ueberfaelligCount = fArr.filter(r => r.status === "überfällig").length;
    const offenCount = fArr.filter(r => r.status === "offen").length;

    // Monatliche Einnahmen
    const monatlich: Record<string, { einnahmen: number; geplant: number }> = {};
    bArr.forEach(r => { const m = r.bezahlt_am?.slice(0, 7); if (m) { if (!monatlich[m]) monatlich[m] = { einnahmen: 0, geplant: 0 }; monatlich[m].einnahmen += Number(r.bezahlt_betrag || r.betrag || 0); } });
    fArr.forEach(r => { const m = r.faellig_am?.slice(0, 7); if (m) { if (!monatlich[m]) monatlich[m] = { einnahmen: 0, geplant: 0 }; monatlich[m].geplant += Number(r.betrag || 0); } });

    // Mahnstufen
    const mahnstufen = { stufe1: 0, stufe2: 0, stufe3: 0 };
    mArr.forEach(m => { if (m.mahnstufe === 1) mahnstufen.stufe1++; else if (m.mahnstufe === 2) mahnstufen.stufe2++; else if (m.mahnstufe >= 3) mahnstufen.stufe3++; });

    // Forderungsalter (unter 30, 30-60, über 60 Tage)
    const now = Date.now();
    const forderungsalter = { unter30: { count: 0, betrag: 0 }, bis60: { count: 0, betrag: 0 }, ueber60: { count: 0, betrag: 0 } };
    uArr.forEach(r => {
      const tage = Math.floor((now - new Date(r.faellig_am).getTime()) / 864e5);
      const b = Number(r.betrag || 0);
      if (tage < 30) { forderungsalter.unter30.count++; forderungsalter.unter30.betrag += b; }
      else if (tage <= 60) { forderungsalter.bis60.count++; forderungsalter.bis60.betrag += b; }
      else { forderungsalter.ueber60.count++; forderungsalter.ueber60.betrag += b; }
    });

    // Alle offene Posten (nicht nur top 5)
    const alleOffene = uArr.sort((a, b) => Number(b.betrag) - Number(a.betrag));
    const patIds = Array.from(new Set(alleOffene.map(r => r.patient_id)));
    const { data: patienten } = await sc.from("patients").select("id, vorname, nachname").in("id", patIds.length > 0 ? patIds : ["00000000-0000-0000-0000-000000000000"]);
    const patMap: Record<string, string> = {};
    (patienten || []).forEach(p => { patMap[p.id] = `${p.nachname}, ${p.vorname}`; });

    return {
      einnahmen, einnahmenProKopf, zahlungsquote, avgVerzoegerung, mahnquote,
      aktivePlaene: aktivePlaene || 0, offenePosten, bezahltCount, faelligCount,
      zahlendePatienten: uniquePatients.size,
      verteilung: { puenktlich, verspaetet, ueberfaellig: ueberfaelligCount, offen: offenCount },
      monatlich: Object.entries(monatlich).sort((a, b) => a[0].localeCompare(b[0])).map(([monat, data]) => ({ monat, ...data })),
      mahnstufen, forderungsalter,
      offenePostenListe: alleOffene.map(r => ({ id: r.id, betrag: Number(r.betrag), faellig_am: r.faellig_am, patient_name: patMap[r.patient_id] || "Unbekannt", patient_id: r.patient_id, mahnstufe: r.mahnstufe, tage: Math.floor((now - new Date(r.faellig_am).getTime()) / 864e5) })),
    };
  }

  const aktuell = await getStats(von, bis);
  let vergleich = null;
  if (vVon && vBis) vergleich = await getStats(vVon, vBis);

  // Prognose 3 Monate
  const heute = new Date();
  const prognose = [];
  for (let i = 1; i <= 3; i++) {
    const m = new Date(heute.getFullYear(), heute.getMonth() + i, 1);
    const mEnd = new Date(heute.getFullYear(), heute.getMonth() + i + 1, 0);
    const { data: upcoming } = await sc.from("raten").select("id, betrag").eq("status", "offen").gte("faellig_am", m.toISOString().slice(0, 10)).lte("faellig_am", mEnd.toISOString().slice(0, 10));
    const sum = (upcoming || []).reduce((s, r) => s + Number(r.betrag || 0), 0);
    prognose.push({ monat: m.toISOString().slice(0, 7), erwartet: sum, raten: (upcoming || []).length, bestCase: sum, worstCase: Math.round(sum * (aktuell.zahlungsquote / 100)) });
  }

  return NextResponse.json({ zeitraum: { von, bis }, aktuell, vergleich, prognose });
}
