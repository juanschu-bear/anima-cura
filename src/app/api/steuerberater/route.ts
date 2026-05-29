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
  const format = url.searchParams.get("format") || "csv"; // csv or pdf

  // Fetch all paid rates in the period
  const { data: raten } = await sc
    .from("raten")
    .select("id, patient_id, betrag, bezahlt_betrag, faellig_am, bezahlt_am, status, mahnstufe, rate_nummer")
    .gte("bezahlt_am", von)
    .lte("bezahlt_am", bis)
    .eq("status", "bezahlt")
    .order("bezahlt_am", { ascending: true });

  // Fetch overdue rates
  const { data: ueberfaellig } = await sc
    .from("raten")
    .select("id, patient_id, betrag, faellig_am, mahnstufe")
    .eq("status", "überfällig");

  // Fetch patient names
  const allPatIds = Array.from(new Set([
    ...(raten || []).map(r => r.patient_id),
    ...(ueberfaellig || []).map(r => r.patient_id),
  ]));
  const { data: patients } = await sc
    .from("patients")
    .select("id, vorname, nachname")
    .in("id", allPatIds.length > 0 ? allPatIds : ["00000000-0000-0000-0000-000000000000"]);

  const patMap: Record<string, string> = {};
  (patients || []).forEach(p => { patMap[p.id] = `${p.nachname}, ${p.vorname}`; });

  const bezahltArr = raten || [];
  const ueberfaelligArr = ueberfaellig || [];

  if (format === "csv") {
    // DATEV-compatible CSV
    const header = "Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen;WKZ Umsatz;Kurs;Basisumsatz;WKZ Basisumsatz;Konto;Gegenkonto (ohne BU-Schlüssel);BU-Schlüssel;Belegdatum;Belegfeld 1;Buchungstext";
    const rows = bezahltArr.map(r => {
      const betrag = Number(r.bezahlt_betrag || r.betrag).toFixed(2).replace(".", ",");
      const datum = r.bezahlt_am ? new Date(r.bezahlt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : "";
      const patient = patMap[r.patient_id] || "Unbekannt";
      const buchungstext = `Rate ${r.rate_nummer} - ${patient}`;
      return `${betrag};S;EUR;;;;1200;8400;;${datum};R-${r.id?.slice(0, 8)};${buchungstext}`;
    });

    const csv = [header, ...rows].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="DATEV_Export_${von}_${bis}.csv"`,
      },
    });
  }

  // PDF Summary as printable HTML
  const totalBezahlt = bezahltArr.reduce((s, r) => s + Number(r.bezahlt_betrag || r.betrag || 0), 0);
  const totalOffen = ueberfaelligArr.reduce((s, r) => s + Number(r.betrag || 0), 0);
  const anzahlBezahlt = bezahltArr.length;
  const anzahlOffen = ueberfaelligArr.length;
  const uniquePatients = new Set(bezahltArr.map(r => r.patient_id)).size;

  // Group by month
  const monatlich: Record<string, { einnahmen: number; count: number }> = {};
  bezahltArr.forEach(r => {
    const m = r.bezahlt_am?.slice(0, 7) || "unknown";
    if (!monatlich[m]) monatlich[m] = { einnahmen: 0, count: 0 };
    monatlich[m].einnahmen += Number(r.bezahlt_betrag || r.betrag || 0);
    monatlich[m].count++;
  });

  const monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const fmtEur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Steuerberater-Export</title>
<style>
body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#1a1a1a;line-height:1.6;font-size:14px}
h1{font-size:22px;border-bottom:2px solid #22c55e;padding-bottom:8px;margin-bottom:4px}
h2{font-size:16px;margin-top:28px;color:#333;border-bottom:1px solid #ddd;padding-bottom:4px}
.subtitle{font-size:13px;color:#666;margin-bottom:24px}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:20px 0}
.kpi{background:#f8f8f8;border-radius:10px;padding:16px;text-align:center}
.kpi-value{font-size:24px;font-weight:800;color:#1a1a1a}
.kpi-label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px}
table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
th,td{text-align:left;padding:8px 10px;border:1px solid #e0e0e0}
th{background:#f5f5f5;font-weight:600;font-size:12px}
.right{text-align:right}
.warn{color:#ef4444}
.footer{margin-top:32px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#999}
@media print{body{margin:10px}.kpi{border:1px solid #ddd}}
</style></head><body>
<h1>Finanzbericht — Praxis Dr. Schubert</h1>
<p class="subtitle">Zeitraum: ${new Date(von).toLocaleDateString("de-DE")} bis ${new Date(bis).toLocaleDateString("de-DE")} · Erstellt am ${new Date().toLocaleDateString("de-DE")}</p>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-value">${fmtEur(totalBezahlt)}</div><div class="kpi-label">Einnahmen</div></div>
  <div class="kpi"><div class="kpi-value">${anzahlBezahlt}</div><div class="kpi-label">Bezahlte Raten</div></div>
  <div class="kpi"><div class="kpi-value">${uniquePatients}</div><div class="kpi-label">Zahlende Patienten</div></div>
</div>

<h2>Monatliche Übersicht</h2>
<table>
<tr><th>Monat</th><th class="right">Einnahmen</th><th class="right">Raten</th></tr>
${Object.entries(monatlich).sort((a, b) => a[0].localeCompare(b[0])).map(([m, d]) => {
    const [y, mo] = m.split("-");
    return `<tr><td>${monate[parseInt(mo) - 1]} ${y}</td><td class="right">${fmtEur(d.einnahmen)}</td><td class="right">${d.count}</td></tr>`;
  }).join("")}
<tr style="font-weight:700;background:#f0f0f0"><td>Gesamt</td><td class="right">${fmtEur(totalBezahlt)}</td><td class="right">${anzahlBezahlt}</td></tr>
</table>

<h2>Offene Forderungen</h2>
${ueberfaelligArr.length === 0 ? "<p>Keine überfälligen Forderungen.</p>" : `
<table>
<tr><th>Patient</th><th class="right">Betrag</th><th>Fällig seit</th><th>Mahnstufe</th></tr>
${ueberfaelligArr.sort((a, b) => Number(b.betrag) - Number(a.betrag)).map(r => {
    const tage = Math.floor((Date.now() - new Date(r.faellig_am).getTime()) / 864e5);
    return `<tr><td>${patMap[r.patient_id] || "Unbekannt"}</td><td class="right warn">${fmtEur(Number(r.betrag))}</td><td>${new Date(r.faellig_am).toLocaleDateString("de-DE")} (${tage} Tage)</td><td>Stufe ${r.mahnstufe}</td></tr>`;
  }).join("")}
<tr style="font-weight:700;background:#f0f0f0"><td>Gesamt offen</td><td class="right warn">${fmtEur(totalOffen)}</td><td colspan="2">${anzahlOffen} Forderungen</td></tr>
</table>`}

<h2>Einzelbuchungen</h2>
<table>
<tr><th>Datum</th><th>Patient</th><th>Rate</th><th class="right">Betrag</th></tr>
${bezahltArr.slice(0, 100).map(r => `<tr><td>${r.bezahlt_am ? new Date(r.bezahlt_am).toLocaleDateString("de-DE") : "–"}</td><td>${patMap[r.patient_id] || "Unbekannt"}</td><td>Rate ${r.rate_nummer}</td><td class="right">${fmtEur(Number(r.bezahlt_betrag || r.betrag))}</td></tr>`).join("")}
${bezahltArr.length > 100 ? `<tr><td colspan="4" style="text-align:center;color:#888">... und ${bezahltArr.length - 100} weitere Buchungen</td></tr>` : ""}
</table>

<p class="footer">Anima Cura · Steuerberater-Export · Praxis Dr. Maria Schubert · Alle Beträge in EUR · Daten auf EU-Servern (Frankfurt)</p>
</body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
