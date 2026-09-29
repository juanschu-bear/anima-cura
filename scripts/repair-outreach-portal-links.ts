import { loadEnvConfig } from "@next/env";
import { writeFileSync } from "node:fs";
import { createServerClient } from "../src/lib/db/supabase";
import { loadActivationCohort } from "../src/lib/services/portal-activation-workflow";
import { planPortalLinkRepairs } from "../src/lib/services/portal-link-repair-plan";
loadEnvConfig(process.cwd());
async function main() {
  const apply = process.argv.includes("--apply");
  if (process.argv.slice(2).some(a => a !== "--apply")) throw new Error("Unknown argument");
  const db = createServerClient();
  const c = await loadActivationCohort(db, new Date().toISOString());
  const ids = new Set<string>();
  for(let n=0;;n+=500){ const q=await db.from("patients").select("id").order("id").range(n,n+499); if(q.error)throw q.error; q.data.forEach(p=>ids.add(p.id));if(q.data.length<500)break; }
  const profiles = [];
  for(let n=0;;n+=500){const q=await db.from("user_profiles").select("id,email,role,patient_id,display_name").order("id").range(n,n+499);if(q.error)throw q.error;profiles.push(...q.data);if(q.data.length<500)break;}
  const users = [];
  for(let page=1;;page++){const q=await db.auth.admin.listUsers({page,perPage:500});if(q.error)throw q.error;users.push(...q.data.users);if(q.data.users.length<500)break;}
  const actions = planPortalLinkRepairs({rows:c.rows,submissions:c.submissions,profiles,users,patientIds:ids,now:Date.now()});
  console.log(JSON.stringify({apply,planned:actions.length,missingProfiles:actions.filter(a=>!a.profile).length}));
  if(!apply)return;
  const backup=`/tmp/anima-portal-links-${Date.now()}.json`;
  writeFileSync(backup,JSON.stringify({createdAt:new Date().toISOString(),actions},null,2),{mode:0o600,flag:"wx"});
  let repaired=0;
  for(const action of actions){
    const fresh=await db.auth.admin.getUserById(action.userId);
    if(fresh.error||!fresh.data.user||JSON.stringify(fresh.data.user.user_metadata)!==JSON.stringify(action.oldMetadata))throw new Error("Account changed since review");
    const u=fresh.data.user;
    const auth=await db.auth.admin.updateUserById(u.id,{user_metadata:{...u.user_metadata,patient_id:action.patientId}});
    if(auth.error)throw new Error("Auth link repair failed");
    let profileError;
    if(action.profile){
      let q=db.from("user_profiles").update({patient_id:action.patientId}).eq("id",u.id).eq("role","patient");
      q=action.profile.patient_id?q.eq("patient_id",action.profile.patient_id):q.is("patient_id",null);
      const result=await q.select("id");profileError=result.error||(!result.data?.length?new Error("Profile changed"):null);
    }else{
      const result=await db.from("user_profiles").insert({id:u.id,email:u.email,role:"patient",patient_id:action.patientId,display_name:u.user_metadata.display_name||u.user_metadata.full_name||"Patient"});profileError=result.error;
    }
    if(profileError){
      const rollback=await db.auth.admin.updateUserById(u.id,{user_metadata:action.oldMetadata});
      throw new Error(rollback.error ? "Profile repair and authentication rollback failed. Inspect private backup immediately." : "Profile repair failed; authentication link rolled back. Inspect backup.");
    }
    repaired++;
  }
  const after=await loadActivationCohort(db,new Date().toISOString());
  const remaining=after.rows.filter(r=>actions.some(a=>a.patientId===r.patientId)&&r.issues.length);
  console.log(JSON.stringify({repaired,remainingIssuesInRepairedPatients:remaining.length,privateBackup:backup,emailsSent:0,passwordsChanged:0}));
  if(remaining.length)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exit(1)});
