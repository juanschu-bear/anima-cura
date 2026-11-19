import test from 'node:test';
import assert from 'node:assert/strict';
import {GET,POST} from '../../../app/api/patient/immediate-invoice/[token]/route';

const token='a'.repeat(43),context={params:{token}};
test('patient invoice proxy keeps the capability on the server and forwards only the session cookie',async()=>{
 const original=globalThis.fetch;let called='';
 globalThis.fetch=async(input,init)=>{called=String(input);
  assert.equal(init?.headers && (init.headers as Record<string,string>).cookie,'immediate_invoice_session=verified');
  return new Response(JSON.stringify({status:'ok'}),{headers:{'content-type':'application/json','set-cookie':'immediate_invoice_session=verified; HttpOnly; Secure; SameSite=Lax; Path=/api/patient/immediate-invoice'}});
 };
 try{
  const response=await GET(new Request(`https://animacura.io/api/patient/immediate-invoice/${token}?view=detail&lang=en`,{headers:{cookie:'sb-auth=secret; immediate_invoice_session=verified'}}),context);
  assert.equal(response.status,200);assert.match(called,/\/api\/patient\/immediate-invoice\/a{43}\?view=detail&lang=en$/);
  assert.match(response.headers.get('set-cookie')??'',/HttpOnly/);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
 }finally{globalThis.fetch=original;}
});
test('invalid tokens and oversized DOB requests stop before the backend',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('must not fetch');};
 try{
  assert.equal((await GET(new Request('https://animacura.io/api/patient/immediate-invoice/bad'),{params:{token:'bad'}})).status,404);
  assert.equal((await POST(new Request(`https://animacura.io/api/patient/immediate-invoice/${token}`,{method:'POST',body:'x'.repeat(1025)}),context)).status,413);
 }finally{globalThis.fetch=original;}
});
