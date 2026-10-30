import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import reference from '../../practice-reference.json';
import {canReadPracticeReference,catalogOrigin,ruleOrigin,matchesReference} from '../../practice-reference';
import {referenceTranslations} from '../../practice-reference-i18n';

test('reference preserves all catalogue sections without patients, demo approvals or actions',()=>{
 assert.equal(Object.keys(reference.catalog).length,8);
 assert.equal(Object.values(reference.catalog).reduce((sum,g)=>sum+g.rows.length,0),199);
 assert.equal(reference.rules.length,33);
 assert.equal(reference.questions.length,19);
 assert.match(reference.sourceSha256,/^[a-f0-9]{64}$/);
 assert.equal(reference.catalog.kuerzel.rows.length,31);
 for(const rule of reference.rules){assert.ok(!('approvedBy' in rule));assert.ok(!('status' in rule));if(rule.question)assert.ok(reference.questions.some(q=>q.id===rule.question));}
 for(const q of reference.questions){assert.ok(!('status' in q));assert.ok(!('answer' in q));for(const id of q.locks)assert.ok(reference.rules.some(r=>r.id===id));}
});
test('provenance separates practice abbreviations, research and mixed rules',()=>{
 assert.equal(catalogOrigin('kuerzel',15),'practice');
 assert.equal(catalogOrigin('kuerzel',16),'research');
 assert.equal(catalogOrigin('pw',0),'research');
 assert.equal(ruleOrigin('Sabine, 14.10.2026'),'practice');
 assert.equal(ruleOrigin('Sabine und BEMA'),'mixed');
 assert.equal(ruleOrigin('Recherche BEMA'),'research');
});
test('reference search supports spelling and case without interpreting clinical facts',()=>{
 assert.ok(matchesReference('BD',reference.catalog.kuerzel.rows));
 assert.ok(matchesReference(' MASSNAHMEN ',['Maßnahmen']));
 assert.ok(!matchesReference('zzznohit',reference.catalog));
});
test('reference access is restricted to staff and navigation preserves unsaved Scribe entry',()=>{
 assert.equal(canReadPracticeReference({role:'patient'}),false);
 assert.equal(canReadPracticeReference({}),false);
 assert.equal(canReadPracticeReference({role:'admin'}),true);
 assert.equal(canReadPracticeReference({role:'admin',permissions:{scribe_schreiben:false}}),false);
 assert.equal(canReadPracticeReference({role:'mitarbeiter',permissions:{scribe_schreiben:true}}),true);
 const page=readFileSync('src/app/scribe/page.tsx','utf8');assert.ok(page.indexOf('canReadPracticeReference(user)')<page.indexOf('<PracticeKnowledge'));
 const menu=readFileSync('src/app/scribe/KnowledgeMenu.tsx','utf8');assert.match(menu,/target='_blank'/);
 const ui=readFileSync('src/app/scribe/PracticeKnowledge.tsx','utf8');assert.doesNotMatch(ui,/dangerouslySetInnerHTML|fetch\(|setInterval|localStorage|\.rpc\(/);
 for(const text of Object.values(referenceTranslations)){assert.ok(text.de);assert.ok(text.en);}
 assert.match(referenceTranslations['knowledge.warning'].de,/nicht als heute gültig geprüft/);
});
