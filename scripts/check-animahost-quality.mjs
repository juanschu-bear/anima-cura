// Build guard: any compose/verifier system-text change needs a matching real-chat replay report.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const files=['src/lib/services/animahost-retrieval-core.ts','docs/animahost/2026-11-24-systemtext-v1.md'];
const hash=createHash('sha256').update(files.map(p=>readFileSync(p,'utf8')).join('\n')).digest('hex');
const path='docs/animahost/quality-replay-manifest.json';
let manifest;try{manifest=JSON.parse(readFileSync(path,'utf8'));}catch{throw Error('AnimaHost: real-chat before/after replay manifest missing. See docs/animahost/quality-replay.md.');}
if(manifest.after.sourceHash!==hash||manifest.before.inputHash!==manifest.after.inputHash||manifest.chats!==20||manifest.before.turns!==manifest.after.turns||manifest.after.turns<20||manifest.before.sendCount!==0||manifest.after.sendCount!==0||manifest.after.technicalErrors!==0||manifest.before.technicalErrors!==0||Date.parse(manifest.before.startedAt)>Date.parse(manifest.after.startedAt))
 throw Error('AnimaHost: system text changed or replay incomplete. Run the same 20 real chats before and after without sending; update the reviewed report and manifest.');
if(!manifest.report||!readFileSync(manifest.report,'utf8').includes(manifest.after.sourceHash))throw Error('AnimaHost: matching per-answer report missing.');
console.log('AnimaHost quality replay: matching before/after report, 20 chats, no sending.');
