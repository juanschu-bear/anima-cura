import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { planInvoiceReconciliation } from "../src/lib/payment-invoice-reconciliation";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const split = line.indexOf("=");
    if (split > 0 && !line.trim().startsWith("#")) process.env[line.slice(0,split).trim()] ??= line.slice(split+1).trim();
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function all(table: string, columns: string) {
  const rows: any[] = [];
  for (let start=0;;start+=1000) {
    const { data, error } = await db.from(table).select(columns).order("id").range(start,start+999);
    if (error) throw new Error(error.message);
    rows.push(...data || []);
    if ((data || []).length<1000) return rows;
  }
}
async function main() {
  if (process.argv.includes("--apply")) throw new Error("Use a verified manifest and the transactional reconciliation function; audit is read-only");
  const writeManifest = process.argv.includes("--manifest");
  const fingerprint = async () => {
    const { data,error } = await db.rpc("payment_backfill_catalog_fingerprint");
    if (error) throw new Error(error.message);
    return data as string;
  };
  const catalog = writeManifest ? await fingerprint() : null;
  const [invoices,payments,banks,used] = await Promise.all([
    all("offene_posten","id,patient_id,unser_zeichen,betrag,gezahlt,offen,status,rechnung_datum,bezahlt_am,nicht_mahnen"),
    all("payment_patient_allocations","id,patient_id,transaction_id,amount_cents,state,source_key,reversal_of_allocation_id"),
    all("transaktionen","id,betrag,datum,verwendungszweck,matching_status,matched_patient_id"),
    all("payment_invoice_allocations","id,patient_allocation_id,invoice_id"),
  ]);
  const { plans,reasons,amountConflicts,missingInvoiceYears } = planInvoiceReconciliation(invoices,payments,banks,new Set(used.map(r=>r.patient_allocation_id)),new Set(used.map(r=>r.invoice_id)));
  const manifest = plans.map(p=>({ request_id:randomUUID(), catalog, invoice_id:p.invoice.id, expected_invoice:p.invoice,
    payments:p.payments.map(row=>({ allocation_id:row.allocation.id,expected_bank:row.bank })) }));
  if (writeManifest) {
    if (!catalog || catalog!==await fingerprint()) throw new Error("Reference catalogue changed during audit");
    fs.mkdirSync("tmp",{recursive:true});
    fs.writeFileSync("tmp/verified-invoice-reconciliation.json",JSON.stringify(manifest),{mode:0o600});
    fs.chmodSync("tmp/verified-invoice-reconciliation.json",0o600);
  }
  console.log(JSON.stringify({mode:"dry-run", invoices:plans.length,payments:plans.reduce((s,p)=>s+p.payments.length,0),
    invoicesChanged:plans.filter(p=>p.changeCents>0).length, debtReductionCents:plans.reduce((s,p)=>s+p.changeCents,0),
    invoicesFullyCovered:plans.filter(p=>p.changeCents>0&&p.targetOpenCents===0).length,reasons,missingInvoiceYears,
    amountConflicts:{invoices:amountConflicts.length,missingCounters:amountConflicts.filter(p=>p.invoice.gezahlt==null||p.invoice.offen==null).length,
      bankCoversGross:amountConflicts.filter(p=>p.payments.reduce((s,r)=>s+Number(r.allocation.amount_cents),0)===Math.round(Number(p.invoice.betrag)*100)).length}},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Invoice audit failed");process.exitCode=1;});
