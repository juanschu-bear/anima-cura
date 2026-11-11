import {createHash} from 'node:crypto';
import {scribeConsistencyInput,type ScribeConsistencyIssue,type ScribeConsistencyResult} from './scribe-consistency';

export type ConsistencyAcknowledgement={fingerprint:string};
export type ConsistencyAudit={
  code:'confirmed_despite_warning';fingerprint:string;confirmedBy:{id:string;name:string};confirmedAt:string;
  issues:ScribeConsistencyIssue[];
};

const suggestion=(issue:ScribeConsistencyIssue)=>{
  if(issue.code.endsWith('_read_failed')||issue.code==='consistency_read_failed')return {kind:'retry_or_confirm_documentation',scope:issue.scope};
  if(issue.code==='expected_position_missing'||issue.code==='position_unexpected_or_changed')return {kind:'recalculate_positions',scope:issue.scope};
  if(issue.code==='selection_invalid'||issue.code==='template_identity_mismatch')return {kind:'reload_template_keep_text',scope:issue.scope,module:issue.module,group:issue.group};
  if(issue.code==='explicit_choice_required')return {kind:'choose_required_option',scope:issue.scope,module:issue.module,group:issue.group};
  if(issue.code==='text_variable_unresolved')return {kind:'complete_documented_value',scope:issue.scope,module:issue.module,variable:issue.variable};
  if(issue.code==='teeth_duplicate')return {kind:'remove_duplicate_tooth',scope:issue.scope};
  return {kind:'review_and_confirm',scope:issue.scope,module:issue.module,group:issue.group};
};

export function consistencyFingerprint(raw:unknown,result:ScribeConsistencyResult):string{
  const parsed=scribeConsistencyInput.safeParse(raw);
  const input=parsed.success?parsed.data:null;
  return createHash('sha256').update(JSON.stringify({ruleVersion:result.ruleVersion,input,issues:result.issues})).digest('hex');
}
export function consistencyConfirmation(raw:unknown,result:ScribeConsistencyResult){
  const fingerprint=consistencyFingerprint(raw,result);
  return {required:true,fingerprint,issues:result.issues,suggestions:result.issues.map(issue=>({issue,...suggestion(issue)}))};
}
export function isConsistencyAcknowledged(raw:unknown,result:ScribeConsistencyResult):boolean{
  const value=(raw as {consistencyAcknowledgement?:unknown}|null)?.consistencyAcknowledgement;
  return !!value&&typeof value==='object'&&(value as {fingerprint?:unknown}).fingerprint===consistencyFingerprint(raw,result);
}
export function consistencyAudit(raw:unknown,result:ScribeConsistencyResult,actor:{id:string;name:string},at=new Date().toISOString()):ConsistencyAudit{
  return {code:'confirmed_despite_warning',fingerprint:consistencyFingerprint(raw,result),confirmedBy:actor,confirmedAt:at,issues:result.issues};
}
export function variablesWithConsistencyAudit(value:unknown,audit:ConsistencyAudit|null):Record<string,unknown>{
  const variables=value&&typeof value==='object'&&!Array.isArray(value)?{...(value as Record<string,unknown>)}:{};
  delete variables._consistencyConfirmation;
  if(audit)variables._consistencyConfirmation=audit;
  return variables;
}
export function storedConsistencyAudit(value:unknown):ConsistencyAudit|null{
  const audit=value&&typeof value==='object'&&!Array.isArray(value)?(value as Record<string,unknown>)._consistencyConfirmation:null;
  if(!audit||typeof audit!=='object'||(audit as {code?:unknown}).code!=='confirmed_despite_warning')return null;
  return audit as ConsistencyAudit;
}
