#!/usr/bin/env node

const IVORIS_APP = "dr-elena-schubert";
const IVORIS_APP_VERSION = "1.0.0";
const IVORIS_API_KEY = "F013AEDEE3BD4328B6CCBBBF7FC6E781";
const IVORIS_LINKNAME = "ba6ef0ce90454830b09bd67621a84024";
const IVORIS_USERNAME = "ivoris372defd3";
const IVORIS_PASSWORD = "4fd7fa876843421eb4452058c404f234";
const RELAY_BASE = `https://relay.computer-konkret.de/relay/${IVORIS_LINKNAME}/webservice/api`;
const BASIC_AUTH = Buffer.from(`${IVORIS_USERNAME}:${IVORIS_PASSWORD}`).toString("base64");

const SUPABASE_URL = "https://zymqxzhjbcxzhzvjqvbv.supabase.co";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5bXF4emhqYmN4emh6dmpxdmJ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU5MDQyNCwiZXhwIjoyMDk0MTY2NDI0fQ.fmK_EEDBSknDcNApOr5xWaBAZnt97hn3Ot1qpDhf_b8";

async function supabaseUpdate(ivorisId, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/patients?ivoris_id=eq.${ivorisId}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Update ${ivorisId}: ${res.status} ${text}`);
  }
}

function mapGender(raw) {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (["m", "male"].includes(v)) return "m";
  if (["w", "f", "female"].includes(v)) return "w";
  if (["d", "divers", "diverse"].includes(v)) return "d";
  return null;
}

function mapInsurance(raw) {
  if (!raw) return "privat";
  const v = raw.toLowerCase();
  if (v.includes("statutory") || v.includes("gesetz")) return "gesetzlich";
  return "privat";
}

function normalizePatient(raw) {
  if (!raw.Id) return null;
  const treatment = raw.Treatment && typeof raw.Treatment === "object" ? raw.Treatment : null;
  const currentIns = raw.CurrentInsurance && typeof raw.CurrentInsurance === "object" ? raw.CurrentInsurance : null;
  const insurant = currentIns?.Insurant && typeof currentIns.Insurant === "object" ? currentIns.Insurant : null;
  const address = raw.Address && typeof raw.Address === "object" ? raw.Address : null;
  const stage = treatment?.OrthodontistStage?.trim() || null;

  return {
    ivoris_id: raw.Id,
    ivoris_nummer: raw.HumanReadableId || null,
    vorname: raw.Firstname || "",
    nachname: raw.Lastname || "",
    geburtsdatum: raw.Birthday ? new Date(raw.Birthday).toISOString().slice(0, 10) : null,
    geschlecht: mapGender(raw.Gender),
    kasse: mapInsurance(raw.HealthInsurance),
    versichertennummer: currentIns?.InsuranceNumber || null,
    versicherung_status: currentIns?.InsuranceStatus || null,
    versicherung_seit: currentIns?.validFrom ? new Date(currentIns.validFrom).toISOString().slice(0, 10) : null,
    versicherter_vorname: insurant?.Firstname || null,
    versicherter_nachname: insurant?.Lastname || null,
    behandlung: stage,
    behandlung_start: null,
    telefon: raw.Phone?.trim() || null,
    mobiltelefon: raw.Mobile?.trim() || null,
    email: raw.Email?.trim() || null,
    strasse: address?.Street || null,
    plz: address?.Zip || null,
    ort: address?.City || null,
    land: address?.Country?.trim() || "DE",
    mandant_index: raw.mandantIndex || null,
  };
}

async function fetchPage(page) {
  const url = `${RELAY_BASE}/Patient/v1/AllPatients?app=${IVORIS_APP}&app_version=${IVORIS_APP_VERSION}&api_key=${IVORIS_API_KEY}&page=${page}`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${BASIC_AUTH}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`IVORIS page ${page}: HTTP ${res.status}`);
  return await res.json();
}

async function main() {
  console.log("Anima Cura — IVORIS Full Sync v2 (alle Felder)\n");
  let page = 0, totalFetched = 0, totalUpdated = 0, totalErrors = 0;

  while (true) {
    process.stdout.write(`Seite ${page} ... `);
    let patients;
    try {
      patients = await fetchPage(page);
    } catch (e) {
      console.log(`FEHLER: ${e.message}`);
      totalErrors++;
      page++;
      if (totalErrors > 5) break;
      continue;
    }
    if (!Array.isArray(patients) || patients.length === 0) {
      console.log("(leer — fertig!)");
      break;
    }
    totalFetched += patients.length;
    const normalized = patients.map(normalizePatient).filter(Boolean);
    let ok = 0, fail = 0;
    for (const p of normalized) {
      const { ivoris_id, ...fields } = p;
      try { await supabaseUpdate(ivoris_id, fields); ok++; } catch { fail++; }
    }
    totalUpdated += ok;
    totalErrors += fail;
    console.log(`${ok} OK` + (fail ? `, ${fail} Fehler` : ""));
    page++;
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nFertig! Seiten: ${page} | Updated: ${totalUpdated} | Fehler: ${totalErrors}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
