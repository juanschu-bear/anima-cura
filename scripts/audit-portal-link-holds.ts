import { loadEnvConfig } from "@next/env";
import { createServerClient } from "../src/lib/db/supabase";
import { loadActivationCohort } from "../src/lib/services/portal-activation-workflow";
loadEnvConfig(process.cwd());
const norm = (x: unknown) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/ß/g,"ss").replace(new RegExp("[^\\p{L}\\p{N}]", "gu"), "");
async function main() {
  const db = createServerClient();
  const c = await loadActivationCohort(db, new Date().toISOString());
  const patients: any[] = [];
  for (let n=0;;n+=500) { const q=await db.from("patients").select("id,vorname,nachname,geburtsdatum,email").order("id").range(n,n+499); if(q.error) throw q.error; patients.push(...q.data); if(q.data.length<500)break; }
  const p = await db.from("user_profiles").select("id,email,patient_id,role"); if(p.error)throw p.error;
  const a = await db.auth.admin.listUsers({page:1,perPage:1000}); if(a.error)throw a.error;
  const byPatient = new Map(patients.map(x=>[x.id,x]));
  const byAuth = new Map(a.data.users.map(x=>[x.id,x]));
  for(const row of c.rows.filter(x=>x.issues.length)) {
    const patient=byPatient.get(row.patientId);
    const subs=c.submissions.filter(s=>row.submissionIds.includes(s.id));
    const profiles=p.data.filter(x=>x.patient_id===row.patientId);
    const accountEmails=new Set(subs.map(s=>s.account_email?.toLowerCase()).filter(Boolean));
    const aliasAccounts=a.data.users.filter(x=>accountEmails.has(x.email?.toLowerCase()));
    console.log(JSON.stringify({ref:row.patientId.slice(0,8),issues:row.issues,
      identity:subs.map(s=>({first: norm(s.vorname)===norm(patient?.vorname),last:norm(s.nachname)===norm(patient?.nachname),dob:s.geburtsdatum===patient?.geburtsdatum,missingPatientDOB:!patient?.geburtsdatum,missingFormDOB:!s.geburtsdatum,
        exactCandidates:patients.filter(p=>norm(p.vorname)===norm(s.vorname)&&norm(p.nachname)===norm(s.nachname)&&!!s.geburtsdatum&&p.geburtsdatum===s.geburtsdatum).length})),
      profiles:profiles.map(x=>{const u=byAuth.get(x.id);return {role:x.role,authRole:u?.app_metadata?.role||u?.user_metadata?.role,authExists:!!u,authTargetSame:u?.user_metadata?.patient_id===row.patientId,authTargetExists:byPatient.has(u?.user_metadata?.patient_id),authTargetMissing:!u?.user_metadata?.patient_id,aliasMatches:accountEmails.has(x.email?.toLowerCase())}}),
      aliasAccounts:aliasAccounts.map(u=>({profileExists:p.data.some(x=>x.id===u.id),metadataTargetSame:u.user_metadata?.patient_id===row.patientId,role:u.app_metadata?.role||u.user_metadata?.role}))}));
  }
}
main().catch(e=>{console.error(e.message);process.exit(1)});
