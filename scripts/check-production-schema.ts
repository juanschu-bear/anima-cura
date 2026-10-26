import { createClient } from "@supabase/supabase-js";
import {readFile} from 'node:fs/promises';
import {verifyRpcContracts,assertRpcAudit,type RpcContracts} from './lib/rpc-contract';

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
      "patient activation profile linkage",
      "user_profiles",
      "id,email,display_name,role,patient_id",
    ),
    runSelectCheck(
      "patient activation identity and recovery contacts",
      "patients",
      "id,ivoris_nummer,geburtsdatum,email,versicherter_email",
    ),
    runSelectCheck(
      "anamnese_submissions core",
      "anamnese_submissions",
      "id,patient_id,vorname,nachname,geburtsdatum,email,answers,status,account_email,matched_patient_id,is_existing,patient_anrede,versicherter_anrede,ivoris_synced,ivoris_sync_error,ivoris_patient_error,ivoris_document_error,ivoris_summary_synced,ivoris_summary_hash,ivoris_field_results",
    ),
    runSelectCheck(
      "patients anima sign fields",
      "patients",
      "id,ivoris_id,vorname,nachname,geburtsdatum,anrede,geschlecht,telefon,email,strasse,plz,ort,mobiltelefon,versicherter_vorname,versicherter_nachname,versicherter_anrede,versicherter_geburtsdatum,versicherter_strasse,versicherter_plz,versicherter_ort,versicherter_telefon,versicherter_email,eb2_vorname,eb2_nachname,eb2_anrede,eb2_telefon,eb2_email,versicherungsart,krankenkasse,zusatzversicherung",
    ),
    runSelectCheck(
      "scribe ivoris retry fields",
      "doku_eintraege",
      "id,ivoris_push_status,ivoris_fehler,ivoris_retry_count,ivoris_next_retry_at,ivoris_last_attempt_at,ivoris_error_class",
    ),
    runSelectCheck(
      "integration outbox jobs",
      "integration_outbox_jobs",
      "id,artifact_type,artifact_id,artifact_version,idempotency_key,status,attempt_count,next_attempt_at,last_error,locked_at,locked_by,succeeded_at,created_at,updated_at",
    ),
    runSelectCheck(
      "integration outbox event history",
      "integration_outbox_events",
      "id,job_id,artifact_type,artifact_id,event_type,previous_status,new_status,attempt_count,error_category,worker_id,next_attempt_at,occurred_at",
    ),
    runSelectCheck(
      "manual integration resolutions",
      "integration_manual_resolutions",
      "id,artifact_type,artifact_id,previous_patient_id,resolved_patient_id,resolved_by,resolved_at",
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
      "immutable invoice payment reconciliation proof",
      "payment_invoice_reconciliations",
      "id,invoice_id,request,result,created_at",
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
    runSelectCheck(
      "billing version records",
      "billing_records",
      "id,kind,patient_id,source_system,source_record_id,source_position_index,head_version",
    ),
    runSelectCheck(
      "billing immutable versions",
      "billing_versions",
      "id,record_id,revision,data,tariff_version_id,state,gross_cents,reason,created_by,created_at,decided_by,decided_at,decision_reason",
    ),
    runSelectCheck(
      "billing idempotency records",
      "billing_requests",
      "id,actor_id,request,result_id,created_at",
    ),
    runSelectCheck(
      "billing payer cases",
      "billing_payer_cases",
      "id,patient_id,from_date,to_date,head_version",
    ),
    runSelectCheck(
      "billing payer versions",
      "billing_payer_versions",
      "id,case_id,revision,service_version_ids,payer_model,patient_share_basis_points,share_source_reference,expected_patient_cents,gross_cents,patient_cents,state,reason,created_by,created_at,decided_by,decided_at,decision_reason",
    ),
    runSelectCheck(
      "billing payer idempotency records",
      "billing_payer_requests",
      "id,actor_id,request,result_id,created_at",
    ),
    runSelectCheck(
      "billing invoice counters",
      "billing_invoice_counters",
      "invoice_year,last_value",
    ),
    runSelectCheck(
      "billing invoice service claims",
      "billing_invoice_service_claims",
      "service_record_id,service_version_id,invoice_id,created_at",
    ),
    runSelectCheck(
      "billing invoice cancellations",
      "billing_invoice_cancellations",
      "id,invoice_id,cancellation_number,cancellation_date,reason,document_id,storage_path,pdf_sha256,pdf_bytes,created_by,created_at",
    ),
    runSelectCheck(
      "billing abandoned preparations",
      "billing_invoice_abandonments",
      "invoice_id,reason,created_by,created_at",
    ),
    runSelectCheck(
      "billing issued invoices",
      "billing_invoices",
      "id,payer_version_id,patient_id,invoice_number,issue_date,due_date,total_cents,status,snapshot,document_id,notification_id,storage_path,pdf_sha256,pdf_bytes,open_item_id,issuance_reason,created_by,created_at,issued_by,issued_at,voided_by,voided_at,void_reason,replaces_invoice_id",
    ),
    runSelectCheck(
      "billing invoice idempotency records",
      "billing_invoice_requests",
      "id,actor_id,request,result_id,created_at",
    ),
  ];

  checks.push((async (): Promise<CheckResult> => {
    try {
      const contracts=JSON.parse(await readFile('scripts/rpc-contracts.json','utf8')) as RpcContracts;
      const requirements=await verifyRpcContracts(process.cwd(),contracts);
      const {data,error}=await supabase.rpc('rpc_permissions_audit',{p_requirements:requirements});
      if(error)throw Error(error.message);
      assertRpcAudit(data);
      if(data.checked!==requirements.length)throw Error('Incomplete RPC audit');
      return {name:'explicit RPC grants for proven caller roles',ok:true,detail:JSON.stringify(data)};
    } catch(error) { return {name:'explicit RPC grants for proven caller roles',ok:false,detail:error instanceof Error?error.message:String(error)}; }
  })());

  checks.push((async (): Promise<CheckResult> => {
    const { data, error } = await supabase.rpc("function_acl_audit", {
      p_module_role: process.env.BILLING_DATABASE_ROLE || "abrechnung_runtime",
    });
    const valid = data && typeof data.ok === "boolean" && Array.isArray(data.violations)
      && Array.isArray(data.default_violations) && Array.isArray(data.platform_default_warnings)
      && typeof data.public_function_count === "number" && data.public_function_count > 0;
    return {
      name: "function execution boundary and explicit migration defaults",
      ok: !error && !!valid && data.ok === true && data.violations.length === 0 && data.default_violations.length === 0,
      detail: error ? error.message : !valid ? "Missing or malformed function ACL audit" : JSON.stringify(data),
    };
  })());

  checks.push((async (): Promise<CheckResult> => {
    const { error } = await supabase.rpc("import_verified_bank_payment_batch", { p_catalog: "schema-probe", p_rows: [] });
    return {
      name: "verified bank import fail-closed guard",
      ok: error?.message === "invalid verified payment batch",
      detail: error?.message === "invalid verified payment batch" ? "Empty batches rejected before any write" : (error?.message ?? "Unexpected guard response"),
    };
  })());
  checks.push((async (): Promise<CheckResult> => {
    const { error } = await supabase.rpc("reconcile_verified_invoice_payments", { p_request: {} });
    return { name: "verified invoice reconciliation fail-closed guard",
      ok: error?.message === "invalid invoice reconciliation request",
      detail: error?.message === "invalid invoice reconciliation request" ? "Incomplete invoice proof rejected before any write" : (error?.message ?? "Unexpected guard response") };
  })());

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
