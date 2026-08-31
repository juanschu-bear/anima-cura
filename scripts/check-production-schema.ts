import { createClient } from "@supabase/supabase-js";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("FEHLT: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runSelectCheck(
  name: string,
  table: string,
  columns: string,
): Promise<CheckResult> {
  const { error } = await supabase.from(table).select(columns).limit(1);
  if (error) {
    return {
      name,
      ok: false,
      detail: `${table}: ${error.message}`,
    };
  }

  return {
    name,
    ok: true,
    detail: `${table}: ${columns}`,
  };
}

async function main() {
  const checks: Promise<CheckResult>[] = [
    runSelectCheck(
      "anamnese_submissions core",
      "anamnese_submissions",
      "id,patient_id,vorname,nachname,geburtsdatum,email,answers,status,account_email,matched_patient_id,is_existing,patient_anrede,versicherter_anrede,ivoris_synced,ivoris_sync_error,ivoris_summary_synced,ivoris_summary_hash",
    ),
    runSelectCheck(
      "patients anima sign fields",
      "patients",
      "id,ivoris_id,vorname,nachname,geburtsdatum,anrede,geschlecht,telefon,email,strasse,plz,ort,mobiltelefon,versicherter_vorname,versicherter_nachname,versicherter_anrede,versicherter_geburtsdatum,versicherter_strasse,versicherter_plz,versicherter_ort,versicherter_telefon,versicherter_email,eb2_vorname,eb2_nachname,eb2_anrede,eb2_telefon,eb2_email,versicherungsart,krankenkasse,zusatzversicherung",
    ),
    runSelectCheck(
      "patient portal core",
      "patients",
      "id,vorname,nachname,behandlung,behandlung_status,behandlungsart,versicherung_status,guthaben,aktiv",
    ),
    runSelectCheck(
      "patient financial views",
      "offene_posten",
      "id,patient_id,betrag,offen,gezahlt,status,rechnung_datum,mahnung_datum,unser_zeichen",
    ),
    runSelectCheck(
      "rates core",
      "raten",
      "id,patient_id,ratenplan_id,rate_nummer,betrag,faellig_am,status,bezahlt_am,bezahlt_betrag,mahnstufe,transaktion_id",
    ),
    runSelectCheck(
      "transactions core",
      "transaktionen",
      "id,datum,betrag,matching_status,matched_patient_id,matched_rate_id,verwendungszweck,absender_name,absender_iban",
    ),
    runSelectCheck(
      "patient documents core",
      "patient_documents",
      "id,patient_id,name,typ,file_url,hochgeladen_am",
    ),
  ];

  const results = await Promise.all(checks);
  const failed = results.filter((result) => !result.ok);

  console.log(
    JSON.stringify(
      {
        ok: failed.length === 0,
        checkedAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
