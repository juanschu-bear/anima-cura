import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {rpcNames,verifyRpcContracts,assertRpcAudit,type RpcContracts} from '../../../../scripts/lib/rpc-contract';

test('RPC inventory rejects unknown/detached targets and resolves finite alternatives',()=>{
 assert.deepEqual(rpcNames(`const rpc=ok?'a':'b';db.rpc(rpc);other['rpc']('c');`,'a.ts'),['a','b','c']);
 assert.throws(()=>rpcNames(`db.rpc(input.name)`,'a.ts'),/finite/);
 assert.throws(()=>rpcNames(`const run=db.rpc;run('a')`,'a.ts'),/extracted/);
 assert.throws(()=>assertRpcAudit({ok:true,checked:1,violations:[{}]}),/failed/);
 assert.throws(()=>assertRpcAudit(null),/failed/);
});
test('all code RPCs and injected-client boundaries have reviewed role evidence',async()=>{
 const c=JSON.parse(await readFile('scripts/rpc-contracts.json','utf8')) as RpcContracts;
 assert.ok((await verifyRpcContracts(process.cwd(),c)).length>30);
 const tampered=structuredClone(c);tampered.files[0].sha256='changed';
 await assert.rejects(verifyRpcContracts(process.cwd(),tampered),/proof|changed/);
});
test('RPC grants require direct EXECUTE for actual role, not PUBLIC or membership',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE other_role; CREATE FUNCTION public.example(p_id uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;`);
  await db.exec(await readFile('supabase/migrations/064_rpc_permissions_audit.sql','utf8'));
  const check=async(signature='public.example(p_id uuid)',role='authenticated')=>(await db.query<{report:{ok:boolean;violations:Array<{reason:string}>}}>('SELECT rpc_permissions_audit($1::jsonb) AS report',[JSON.stringify([{name:'example',signature,role,file:'synthetic.ts'}])])).rows[0].report;
  assert.equal((await check()).violations[0].reason,'explicit_execute_missing');
  await db.exec('GRANT EXECUTE ON FUNCTION public.example(uuid) TO other_role; GRANT other_role TO authenticated;');
  assert.equal((await check()).ok,false);
  await db.exec('GRANT EXECUTE ON FUNCTION public.example(uuid) TO authenticated');
  assert.equal((await check()).ok,true);
  await db.exec('REVOKE EXECUTE ON FUNCTION public.example(uuid) FROM authenticated');
  assert.equal((await check()).ok,false);
  assert.equal((await check('public.example(p_id text)')).violations[0].reason,'function_missing_or_signature_changed');
  assert.equal((await check(undefined,'unknown_role')).violations[0].reason,'role_missing');
  await db.exec('SET ROLE anon');await assert.rejects(db.query(`SELECT rpc_permissions_audit('[]')`),/permission denied/);await db.exec('RESET ROLE');
 }finally{await db.close();}
});
