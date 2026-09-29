import type { OutreachAuditRow, OutreachSubmission } from "./patient-outreach-audit";
export type RepairProfile = { id: string; email: string | null; role: string; patient_id: string | null; display_name?: string | null };
export type RepairAuth = { id: string; email?: string; user_metadata: Record<string, any>; app_metadata: Record<string, any>; banned_until?: string };
export function planPortalLinkRepairs(input: { rows: OutreachAuditRow[]; submissions: OutreachSubmission[]; profiles: RepairProfile[]; users: RepairAuth[]; patientIds: Set<string>; now: number }) {
  const actions: { patientId: string; userId: string; profile: RepairProfile | null; oldMetadata: Record<string, any> }[] = [];
  for (const row of input.rows) {
    if (!row.issues.length || row.issues.some(x => !["portal_account_link_review", "portal_account_missing"].includes(x))) continue;
    const subs = input.submissions.filter(s => row.submissionIds.includes(s.id));
    const aliases = new Set(subs.map(s => s.account_email?.trim().toLowerCase()).filter(Boolean));
    if (aliases.size !== 1 || subs.some(s => !s.account_email)) continue;
    const alias = Array.from(aliases)[0];
    // Never reassign a login that is referenced by another patient's form.
    if (input.submissions.some(s => s.account_email?.trim().toLowerCase() === alias && (s.matched_patient_id || s.patient_id) !== row.patientId)) continue;
    const users = input.users.filter(u => u.email?.toLowerCase() === alias);
    if (users.length !== 1) continue;
    const user = users[0];
    if ((user.app_metadata.role || user.user_metadata.role) !== "patient" || (user.banned_until && Date.parse(user.banned_until) > input.now)) continue;
    const oldId = user.user_metadata.patient_id;
    if (oldId && oldId !== row.patientId && input.patientIds.has(oldId)) continue;
    const profile = input.profiles.find(p => p.id === user.id) || null;
    if (profile && (profile.role !== "patient" || profile.email?.toLowerCase() !== alias || (profile.patient_id && profile.patient_id !== row.patientId && input.patientIds.has(profile.patient_id)))) continue;
    if (input.profiles.some(p => p.patient_id === row.patientId && p.id !== user.id)) continue;
    if (!input.patientIds.has(row.patientId)) continue;
    actions.push({ patientId: row.patientId, userId: user.id, profile, oldMetadata: user.user_metadata });
  }
  return actions;
}
