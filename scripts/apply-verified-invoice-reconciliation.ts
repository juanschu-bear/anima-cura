import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for(const file of [".env.local",".env"]) {
  if(!fs.existsSync(file))continue;
  for(const line of fs.readFileSync(file,"utf8").split(/\r?\n/)) {
    const n=line.indexOf("=");
    if(n>0&&!line.trim().startsWith("#"))process.env[line.slice(0,n).trim()]??=line.slice(n+1).trim();
  }
}
async function main() {
  const requests=JSON.parse(fs.readFileSync("tmp/verified-invoice-reconciliation.json","utf8"));
  if(!Array.isArray(requests)||new Set(requests.map(r=>r.invoice_id)).size!==requests.length
    ||new Set(requests.map(r=>r.request_id)).size!==requests.length)throw new Error("Invalid invoice manifest");
  const expected=new Map<string,any>();
  for(const request of requests)for(const row of request.payments) {
    if(expected.has(row.allocation_id))throw new Error("Duplicate payment source in manifest");
    expected.set(row.allocation_id,{invoice:request.invoice_id,amount:Math.round(Number(row.expected_bank.betrag)*100)});
  }
  const apply=process.argv.includes("--apply");
  console.log(JSON.stringify({mode:apply?"apply":"dry-run",invoices:requests.length}));
  if(!apply)return;
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  let cursor=0,processed=0,already=0,linked=0,reduction=0,stopped=false;
  // Bounded concurrency overlaps transport only; the database serializes the invoice transactions.
  await Promise.all(Array.from({length:4},async()=>{
    while(!stopped&&cursor<requests.length) {
      const index=cursor++;
      const {data,error}=await db.rpc("reconcile_verified_invoice_payments",{p_request:requests[index]});
      if(error){stopped=true;throw new Error(`Invoice reconciliation stopped at index ${index}: ${error.message}. Completed requests are safe to retry.`);}
      processed++;
      if(data.already_applied)already++;
      else {linked+=Number(data.linked_payments);reduction+=Number(data.debt_reduction_cents);}
      if(processed%100===0||processed===requests.length)console.log(JSON.stringify({processed,alreadyApplied:already,newLinks:linked,debtReductionCents:reduction}));
    }
  }));
  const verified=new Set<string>();
  for(let start=0;;start+=1000) {
    const {data,error}=await db.from("payment_invoice_allocations")
      .select("id,patient_allocation_id,invoice_id,amount_cents,state").like("source_key","verified-invoice-v1:%").order("id").range(start,start+999);
    if(error)throw new Error("Cannot verify invoice links");
    for(const row of data||[]) {
      const source=expected.get(row.patient_allocation_id);if(!source)continue;
      if(verified.has(row.patient_allocation_id)||row.invoice_id!==source.invoice||Number(row.amount_cents)!==source.amount||row.state!=="allocated_auto")throw new Error("Invoice link verification mismatch");
      verified.add(row.patient_allocation_id);
    }
    if((data||[]).length<1000)break;
  }
  if(verified.size!==expected.size)throw new Error("Invoice link coverage incomplete");
  console.log(JSON.stringify({complete:true,invoices:processed,alreadyApplied:already,newLinks:linked,debtReductionCents:reduction,verifiedPayments:verified.size}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Invoice reconciliation failed");process.exitCode=1;});
