import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import { PRAXIS_BANK, RECHNUNG_FOOTER, PAKETE } from "@/lib/rechnungs-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const patientId = request.nextUrl.searchParams.get("patient_id");
  const ratenplanId = request.nextUrl.searchParams.get("ratenplan_id");
  const typ = request.nextUrl.searchParams.get("typ") || "mkv"; // mkv, goz, kasse

  if (!patientId) return NextResponse.json({ error: "patient_id erforderlich" }, { status: 400 });

  const sc = createServerClient();

  // Fetch patient
  const { data: patient } = await sc.from("patients").select("*").eq("id", patientId).single();
  if (!patient) return NextResponse.json({ error: "Patient nicht gefunden" }, { status: 404 });

  // Fetch ratenplan
  let ratenplan: any = null;
  if (ratenplanId) {
    const { data: rp } = await sc.from("ratenplaene").select("*").eq("id", ratenplanId).single();
    ratenplan = rp;
  } else {
    const { data: rps } = await sc.from("ratenplaene").select("*").eq("patient_id", patientId).order("erstellt_am", { ascending: false }).limit(1);
    ratenplan = rps?.[0];
  }

  // Fetch raten
  let raten: any[] = [];
  if (ratenplan) {
    const { data: r } = await sc.from("raten").select("*").eq("ratenplan_id", ratenplan.id).order("faellig_am", { ascending: true });
    raten = r || [];
  }

  const gesamtBetrag = ratenplan?.gesamtbetrag || 0;
  const bezahlt = raten.filter(r => r.status === "bezahlt").reduce((s, r) => s + Number(r.bezahlt_betrag || r.betrag || 0), 0);
  const offen = gesamtBetrag - bezahlt;
  const rechnungsDatum = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const faelligDatum = new Date(Date.now() + 14 * 864e5).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const rechnungsNr = `${String(Math.floor(Math.random() * 90000) + 10000).padStart(8, "0")}`;
  const unserZeichen = `P-${patient.id?.slice(0, 4).toUpperCase()}-UZ-${ratenplan?.id?.slice(0, 2) || "1"}`;

  // Determine paket based on gesamtbetrag
  const paket = PAKETE.find(p => Math.abs(p.endsumme - gesamtBetrag) < 200) || PAKETE[0];

  const empfaenger = `${patient.vorname} ${patient.nachname}`;

  const fmtEur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rechnung ${rechnungsNr}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  body { font-family: "Times New Roman", Times, serif; font-size: 11px; color: #000; line-height: 1.4; max-width: 680px; margin: 0 auto; padding: 20px; }
  .header { margin-bottom: 20px; }
  .header-name { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
  .header-title { font-size: 11px; margin-bottom: 1px; }
  .header-addr { font-size: 10px; color: #333; }
  .absender { font-size: 8px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 12px; color: #444; }
  .empfaenger { font-size: 11px; margin-bottom: 20px; line-height: 1.5; }
  h1 { font-size: 15px; font-weight: bold; margin: 16px 0 12px; letter-spacing: 1px; }
  .meta-grid { display: grid; grid-template-columns: auto 1fr; gap: 3px 16px; font-size: 10px; margin-bottom: 16px; }
  .meta-label { font-weight: bold; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin: 8px 0; }
  th { background: #f5f5f5; text-align: left; padding: 5px 6px; border: 1px solid #ccc; font-weight: bold; font-size: 9px; }
  td { padding: 4px 6px; border: 1px solid #ddd; vertical-align: top; }
  .right { text-align: right; }
  .abzug { color: #666; }
  .total-row { font-weight: bold; background: #f0f0f0; }
  .payment-box { border: 1px solid #000; padding: 10px; margin: 14px 0; font-size: 10px; line-height: 1.5; }
  .footer { font-size: 8px; color: #555; margin-top: 20px; line-height: 1.4; border-top: 1px solid #ccc; padding-top: 8px; }
  .raten-section { margin-top: 16px; }
  .raten-section h3 { font-size: 12px; margin-bottom: 6px; }
  .status-paid { color: #2a7d2e; }
  .status-overdue { color: #c0392b; }
  .status-open { color: #777; }
  @media print { body { margin: 0; padding: 0; } }
</style></head><body>

<div class="header">
  <div style="display: flex; justify-content: space-between;">
    <div>
      <div class="header-name">${PRAXIS_BANK.name}</div>
      <div class="header-title">${PRAXIS_BANK.titel}</div>
    </div>
    <div style="text-align: right; font-size: 10px;">
      ${PRAXIS_BANK.adresse}<br>
      Tel.: ${PRAXIS_BANK.telefon} · Fax: ${PRAXIS_BANK.fax}
    </div>
  </div>
</div>

<div class="absender">${PRAXIS_BANK.name} · Nikolaistrasse 20 im Oelßner's Hof · 04109 Leipzig</div>

<div class="empfaenger">
  ${patient.anrede ? patient.anrede + "<br>" : ""}
  ${empfaenger}<br>
  ${patient.strasse || ""}<br>
  ${patient.plz || ""} ${patient.ort || ""}
</div>

<h1>RECHNUNG</h1>

<div class="meta-grid">
  <span class="meta-label">Rechnungsdatum:</span><span>${rechnungsDatum}</span>
  <span class="meta-label">Unser Zeichen:</span><span>${unserZeichen}</span>
  <span class="meta-label">Rechnungsnummer:</span><span>${rechnungsNr}</span>
  <span class="meta-label">Behandelte Person:</span><span>${patient.nachname}, ${patient.vorname}${patient.geburtsdatum ? ` · geb. ${new Date(patient.geburtsdatum).toLocaleDateString("de-DE")}` : ""}</span>
</div>

<p style="font-size: 10px;">Bitte bei Überweisung <strong>Unser Zeichen</strong> angeben.</p>

<p style="font-size: 10px;">Für die erbrachten kieferorthopädischen und zahnärztlichen Leistungen erlaube ich mir in Rechnung zu stellen:</p>

<table>
  <thead>
    <tr>
      <th>Nr.</th>
      <th>Leistung</th>
      <th>Anzahl</th>
      <th>Faktor</th>
      <th class="right">GKV-Abzug</th>
      <th class="right">Endpreis EUR</th>
    </tr>
  </thead>
  <tbody>
    ${paket.positionen.map(p => `
      <tr>
        <td>${p.goz_nr}</td>
        <td>${p.bezeichnung}${p.begruendung ? `<br><span style="font-size:8px;color:#666;">${p.begruendung}</span>` : ""}</td>
        <td>${p.anzahl}</td>
        <td>${p.faktor.toFixed(2)}</td>
        <td class="right abzug">${p.gkv_abzug > 0 ? `-${fmtEur(p.gkv_abzug)}` : "—"}</td>
        <td class="right">${fmtEur(p.endpreis)}</td>
      </tr>
    `).join("")}
    <tr class="total-row">
      <td colspan="5">Gesamtbetrag</td>
      <td class="right">${fmtEur(paket.endsumme)}</td>
    </tr>
  </tbody>
</table>

${ratenplan ? `
<div class="raten-section">
  <h3>Ratenplan — ${raten.length} Raten à ${fmtEur(Number(raten[0]?.betrag || 0))} EUR</h3>
  <table>
    <thead>
      <tr><th>Rate</th><th>Fällig am</th><th class="right">Betrag</th><th>Status</th></tr>
    </thead>
    <tbody>
      ${raten.slice(0, 24).map(r => {
        const isPaid = r.status === "bezahlt";
        const isOverdue = r.status === "überfällig";
        const statusClass = isPaid ? "status-paid" : isOverdue ? "status-overdue" : "status-open";
        const statusText = isPaid ? `✓ Bezahlt${r.bezahlt_am ? ` (${new Date(r.bezahlt_am).toLocaleDateString("de-DE")})` : ""}` : isOverdue ? `! Überfällig` : "Ausstehend";
        return `<tr>
          <td>${r.rate_nummer}</td>
          <td>${new Date(r.faellig_am).toLocaleDateString("de-DE")}</td>
          <td class="right">${fmtEur(Number(r.betrag))}</td>
          <td class="${statusClass}">${statusText}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>
  <p style="font-size:10px;margin-top:6px;"><strong>Bezahlt:</strong> ${fmtEur(bezahlt)} EUR · <strong>Offen:</strong> ${fmtEur(offen)} EUR</p>
</div>
` : ""}

<div class="payment-box">
  Bitte überweisen Sie den ${ratenplan ? "offenen " : ""}Betrag in Höhe von <strong>${fmtEur(ratenplan ? offen : paket.endsumme)} EUR</strong>
  bis spätestens ${faelligDatum} auf unser Konto Nr. ${PRAXIS_BANK.konto} bei der ${PRAXIS_BANK.bank}
  Bankleitzahl: ${PRAXIS_BANK.blz}.<br>
  IBAN: ${PRAXIS_BANK.iban} · BIC: ${PRAXIS_BANK.bic}<br><br>
  <strong>Verwendungszweck: ${unserZeichen}</strong>
</div>

<div class="footer">
  ${RECHNUNG_FOOTER.konformitaet}<br><br>
  ${RECHNUNG_FOOTER.eigentum} ${RECHNUNG_FOOTER.umsatzsteuer}
</div>

</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
