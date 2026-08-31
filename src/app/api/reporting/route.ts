import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import { hasReliablePatientIdentity, isSafeDunningRate } from "@/lib/patient-safety";
import { resolveOpenItemAmount, resolveOpenItemStatus } from "@/lib/open-items";

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
    const [
      { data: bezahlt },
      { data: faellig },
      { data: ueberfaellig },
      { count: aktivePlaene },
      { data: mahnungen },
      { data: quarterTransactions },
      { data: receivables },
    ] = await Promise.all([
      sc.from("raten").select("id, betrag, bezahlt_betrag, faellig_am, bezahlt_am, mahnstufe, patient_id").eq("status", "bezahlt").gte("bezahlt_am", from).lte("bezahlt_am", to),
      sc.from("raten").select("id, betrag, faellig_am, status, bezahlt_am, mahnstufe, patient_id").gte("faellig_am", from).lte("faellig_am", to),
      sc.from("raten").select("id, betrag, faellig_am, patient_id, mahnstufe").eq("status", "überfällig"),
      sc.from("ratenplaene").select("id", { count: "exact", head: true }).eq("status", "aktiv"),
      sc.from("raten").select("id, mahnstufe, faellig_am, patient_id, betrag").gt("mahnstufe", 0).gte("faellig_am", from).lte("faellig_am", to),
      sc.from("transaktionen")
        .select("id, betrag, datum, matching_status, matched_patient_id")
        .gte("datum", from)
        .lte("datum", to)
        .gt("betrag", 0)
        .neq("matching_status", "ignoriert"),
      sc.from("offene_posten")
        .select("id, betrag, offen, gezahlt, status, patient_id, rechnung_datum, bezahlt_am, mahnstufe"),
    ]);

    let bArr = bezahlt || [], fArr = faellig || [], uArr = ueberfaellig || [], mArr = mahnungen || [];
    const txArr = quarterTransactions || [];
    const receivableArr = receivables || [];
    const allRatePatientIds = Array.from(
      new Set([
        ...bArr,
        ...fArr,
        ...uArr,
        ...mArr,
        ...txArr.map((entry) => ({ patient_id: entry.matched_patient_id })),
        ...receivableArr,
      ].map((entry) => entry.patient_id).filter(Boolean))
    );
    const { data: patientScopes } = await sc
      .from("patients")
      .select("id, vorname, nachname, kasse, ivoris_nummer, ivoris_id, behandlung")
      .in("id", allRatePatientIds.length > 0 ? allRatePatientIds : ["00000000-0000-0000-0000-000000000000"]);
    const patMap: Record<string, string> = {};
    const kasseMap: Record<string, "gesetzlich" | "privat" | undefined> = {};
    (patientScopes || []).forEach((p) => {
      patMap[p.id] = `${p.nachname}, ${p.vorname}`;
      kasseMap[p.id] = p.kasse as "gesetzlich" | "privat" | undefined;
    });

    const patientById = new Map((patientScopes || []).map((patient) => [patient.id, patient]));
    bArr = bArr.filter((rate) => hasReliablePatientIdentity(patientById.get(rate.patient_id)));
    fArr = fArr.filter((rate) => hasReliablePatientIdentity(patientById.get(rate.patient_id)));
    uArr = uArr.filter((rate) => isSafeDunningRate(rate, patientById.get(rate.patient_id)));
    mArr = mArr.filter((rate) => isSafeDunningRate(rate, patientById.get((rate as any).patient_id)));

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
    const receivableOpenRows = receivableArr.filter((item) => {
      const effectiveStatus = resolveOpenItemStatus(item);
      if (!["offen", "teilbezahlt", "überfällig"].includes(effectiveStatus)) return false;
      return hasReliablePatientIdentity(patientById.get(item.patient_id));
    });
    const offenePosten = receivableOpenRows.reduce((sum, item) => {
      return sum + resolveOpenItemAmount(item);
    }, 0);

    const quarterFinance = {
      eingang_gesamt: 0,
      eingang_privat: 0,
      eingang_gesetzlich: 0,
      eingang_unklar: 0,
      zugeordnet_gesamt: 0,
      offene_rechnungen_im_quartal: 0,
      offene_summe_im_quartal: 0,
      teilbezahlt_rechnungen_im_quartal: 0,
      teilbezahlt_summe_im_quartal: 0,
      offen_gesamt: 0,
      offen_privat: 0,
      offen_gesetzlich: 0,
      offen_unklar: 0,
      teilbezahlt_gesamt: 0,
      teilbezahlt_privat: 0,
      teilbezahlt_gesetzlich: 0,
      teilbezahlt_unklar: 0,
    };

    for (const tx of txArr) {
      const amount = Number(tx.betrag || 0);
      const kasse = tx.matched_patient_id ? kasseMap[tx.matched_patient_id] : undefined;
      quarterFinance.eingang_gesamt += amount;
      if (tx.matched_patient_id) {
        quarterFinance.zugeordnet_gesamt += amount;
      }
      if (kasse === "gesetzlich") {
        quarterFinance.eingang_gesetzlich += amount;
      } else if (kasse === "privat") {
        quarterFinance.eingang_privat += amount;
      } else {
        quarterFinance.eingang_unklar += amount;
      }
    }

    for (const item of receivableArr) {
      const effectiveStatus = resolveOpenItemStatus(item);
      if (!["offen", "teilbezahlt", "überfällig"].includes(effectiveStatus)) continue;
      const amount = resolveOpenItemAmount(item);
      const kasse = item.patient_id ? kasseMap[item.patient_id] : undefined;
      const invoiceDate = item.rechnung_datum || null;
      const isQuarterReceivable = Boolean(invoiceDate && invoiceDate >= from && invoiceDate <= to);

      quarterFinance.offen_gesamt += amount;
      if (kasse === "gesetzlich") {
        quarterFinance.offen_gesetzlich += amount;
      } else if (kasse === "privat") {
        quarterFinance.offen_privat += amount;
      } else {
        quarterFinance.offen_unklar += amount;
      }

      if (effectiveStatus === "teilbezahlt") {
        quarterFinance.teilbezahlt_gesamt += amount;
        if (isQuarterReceivable) {
          quarterFinance.teilbezahlt_rechnungen_im_quartal += 1;
          quarterFinance.teilbezahlt_summe_im_quartal += amount;
        }
        if (kasse === "gesetzlich") {
          quarterFinance.teilbezahlt_gesetzlich += amount;
        } else if (kasse === "privat") {
          quarterFinance.teilbezahlt_privat += amount;
        } else {
          quarterFinance.teilbezahlt_unklar += amount;
        }
      } else if (isQuarterReceivable) {
        quarterFinance.offene_rechnungen_im_quartal += 1;
        quarterFinance.offene_summe_im_quartal += amount;
      }
    }

    // Zahlungsstatus-Verteilung
    const puenktlich = fArr.filter(r => r.status === "bezahlt" && r.bezahlt_am && r.faellig_am && (new Date(r.bezahlt_am).getTime() - new Date(r.faellig_am).getTime()) <= 3 * 864e5).length;
    const verspaetet = fArr.filter(r => r.status === "bezahlt" && r.bezahlt_am && r.faellig_am && (new Date(r.bezahlt_am).getTime() - new Date(r.faellig_am).getTime()) > 3 * 864e5).length;
    const ueberfaelligCount = fArr.filter(r => r.status === "überfällig").length;
    const offenCount = fArr.filter(r => r.status === "offen").length;

    // Monatliche Einnahmen
    const monatlich: Record<string, { einnahmen: number; geplant: number }> = {};
    bArr.forEach(r => { const m = r.bezahlt_am?.slice(0, 7); if (m) { if (!monatlich[m]) monatlich[m] = { einnahmen: 0, geplant: 0 }; monatlich[m].einnahmen += Number(r.bezahlt_betrag || r.betrag || 0); } });
    fArr.forEach(r => { const m = r.faellig_am?.slice(0, 7); if (m) { if (!monatlich[m]) monatlich[m] = { einnahmen: 0, geplant: 0 }; monatlich[m].geplant += Number(r.betrag || 0); } });

    // Mahnstufen with patient details
    const mahnstufen = { stufe1: 0, stufe2: 0, stufe3: 0 };
    const mahnDetails: { stufe: number; patient_id: string; betrag: number; faellig_am: string }[] = [];
    mArr.forEach(m => {
      if (m.mahnstufe === 1) mahnstufen.stufe1++;
      else if (m.mahnstufe === 2) mahnstufen.stufe2++;
      else if (m.mahnstufe >= 3) mahnstufen.stufe3++;
      mahnDetails.push({ stufe: m.mahnstufe, patient_id: (m as any).patient_id || "", betrag: 0, faellig_am: m.faellig_am });
    });

    // Forderungsalter (unter 30, 30-60, über 60 Tage)
    const now = Date.now();
    const forderungsalter = { unter30: { count: 0, betrag: 0 }, bis60: { count: 0, betrag: 0 }, ueber60: { count: 0, betrag: 0 } };
    receivableOpenRows.forEach(r => {
      const basisDatum = r.rechnung_datum || r.bezahlt_am || null;
      const tage = basisDatum ? Math.floor((now - new Date(basisDatum).getTime()) / 864e5) : 0;
      const b = resolveOpenItemAmount(r);
      if (tage < 30) { forderungsalter.unter30.count++; forderungsalter.unter30.betrag += b; }
      else if (tage <= 60) { forderungsalter.bis60.count++; forderungsalter.bis60.betrag += b; }
      else { forderungsalter.ueber60.count++; forderungsalter.ueber60.betrag += b; }
    });

    // Alle echten offenen Posten aus IVORIS / offene_posten.
    const alleOffene = [...receivableOpenRows].sort((a, b) => {
      const av = resolveOpenItemAmount(a);
      const bv = resolveOpenItemAmount(b);
      return bv - av;
    });

    // Enrich mahnDetails with names and betrag
    const mahnDetailsMapped = mahnDetails.map(m => {
      const matchingRate = mArr.find(r => r.faellig_am === m.faellig_am && (r as any).patient_id === m.patient_id);
      return { ...m, betrag: Number((matchingRate as any)?.betrag || 0), patient_name: patMap[m.patient_id] || "Unbekannt" };
    });

    return {
      einnahmen, einnahmenProKopf, zahlungsquote, avgVerzoegerung, mahnquote,
      aktivePlaene: aktivePlaene || 0, offenePosten, bezahltCount, faelligCount,
      zahlendePatienten: uniquePatients.size,
      quartalsumsatz: quarterFinance,
      verteilung: { puenktlich, verspaetet, ueberfaellig: ueberfaelligCount, offen: offenCount },
      monatlich: Object.entries(monatlich).sort((a, b) => a[0].localeCompare(b[0])).map(([monat, data]) => ({ monat, ...data })),
      mahnstufen, mahnDetails: mahnDetailsMapped, forderungsalter,
      offenePostenListe: alleOffene.map(r => {
        const referenceDate = r.rechnung_datum || r.bezahlt_am || null;
        const amount = resolveOpenItemAmount(r);
        return {
          id: r.id,
          betrag: amount,
          faellig_am: referenceDate,
          patient_name: patMap[r.patient_id] || "Unbekannt",
          patient_id: r.patient_id,
          mahnstufe: r.mahnstufe || 0,
          tage: referenceDate ? Math.floor((now - new Date(referenceDate).getTime()) / 864e5) : 0,
        };
      }),
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
