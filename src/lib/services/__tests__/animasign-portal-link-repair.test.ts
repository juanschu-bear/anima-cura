import test from "node:test";
import assert from "node:assert/strict";
import { planPortalLinkRepairs } from "../portal-link-repair-plan";
import type { OutreachAuditRow, OutreachSubmission } from "../patient-outreach-audit";
function input() {
  return { rows: [{ patientId:"p1", submissionIds:["s1"], issues:["portal_account_link_review"] } as OutreachAuditRow],
    submissions:[{id:"s1", patient_id:"p1",matched_patient_id:"p1",account_email:"nora@animacura.de"} as OutreachSubmission],
    profiles:[{id:"u1",email:"nora@animacura.de",role:"patient",patient_id:"p1"}],
    users:[{id:"u1",email:"nora@animacura.de",user_metadata:{role:"patient",patient_id:"deleted"},app_metadata:{role:"patient"}}],
    patientIds:new Set(["p1"]),now:Date.now() };
}
test("repairs a stale deleted auth target only when form, profile and account agree",()=>{
  assert.equal(planPortalLinkRepairs(input()).length,1);
  const x=input();x.patientIds.add("deleted");assert.equal(planPortalLinkRepairs(x).length,0);
});
test("does not repair name conflicts or multiple accounts by guessing",()=>{
  for(const issue of ["patient_identity_review","multiple_portal_accounts","conflicting_patient_links"]){const x=input();x.rows[0].issues.push(issue);assert.equal(planPortalLinkRepairs(x).length,0);}
});
test("can restore a missing profile but never steals a login used by a different patient",()=>{
  const x=input();x.profiles=[];x.rows[0].issues=["portal_account_missing"];
  assert.equal(planPortalLinkRepairs(x).length,1);
  x.submissions.push({...x.submissions[0],id:"s2",patient_id:"p2",matched_patient_id:"p2"});
  assert.equal(planPortalLinkRepairs(x).length,0);
});
test("never changes a practice account or creates a second patient account",()=>{
  const x=input();x.users[0].app_metadata.role="admin";assert.equal(planPortalLinkRepairs(x).length,0);
  const y=input();y.profiles.push({...y.profiles[0],id:"u2"});assert.equal(planPortalLinkRepairs(y).length,0);
});
