import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('only the authenticated invoice worker bypasses public link request throttles',()=>{
 const route=readFileSync('src/app/api/patient/invoice-access/request/route.ts','utf8');
 const service=readFileSync('src/lib/services/invoice-contact-access.ts','utf8');
 assert.match(route,/INVOICE_ACCESS_WORKER_SECRET/);
 assert.match(route,/trustedWorker:\s*worker/);
 assert.match(service,/ipHash\s*&&\s*!input\.trustedWorker/);
 assert.match(service,/input\.trustedWorker\s*\?\s*null\s*:/);
 assert.match(route,/deliver:\s*!worker/,'the worker receives a token but never sends a second mail');
});
