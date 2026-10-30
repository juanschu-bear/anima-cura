import test from 'node:test';
import assert from 'node:assert/strict';
import {versionPrecondition} from '../../scribe-version-precondition';
import {scribeEntryTarget} from '../../scribe-entry-target';
const entry={version:3,patient_id:'patient-a',status:'bestaetigt'};
test('exact source version and patient accepted',()=>assert.equal(versionPrecondition({expected_version:3,patient_id:'patient-a'},entry),null));
test('stale source, wrong patient and discarded entries rejected',()=>{assert.equal(versionPrecondition({expected_version:2},entry),'version');assert.equal(versionPrecondition({expected_version:'3'},entry),'version');assert.equal(versionPrecondition({patient_id:'patient-b'},entry),'patient');assert.equal(versionPrecondition({}, {...entry,status:'verworfen'}),'discarded');});
test('existing callers retain optional precondition compatibility',()=>assert.equal(versionPrecondition({},entry),null));
test('login return keeps only validated entry and patient identifiers',()=>{const patient='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';assert.equal(scribeEntryTarget({entry:id,patient}),`/scribe?entry=${id}&patient=${patient}`);assert.equal(scribeEntryTarget({entry:'https://evil.example',patient}),'/scribe');assert.equal(scribeEntryTarget({entry:id}),'/scribe');});
