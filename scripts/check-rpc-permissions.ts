import {loadEnvConfig} from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import {verifyRpcContracts,assertRpcAudit,type RpcContracts} from './lib/rpc-contract';
loadEnvConfig(process.cwd(),false,{info(){},error(){}});
async function main(){
 const contracts=JSON.parse(await readFile('scripts/rpc-contracts.json','utf8')) as RpcContracts;
 const requirements=await verifyRpcContracts(process.cwd(),contracts);
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('RPC integration test requires database environment; no silent skip');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.rpc('rpc_permissions_audit',{p_requirements:requirements});
 if(error)throw Error(`RPC metadata unavailable: ${error.message}`);
 assertRpcAudit(data);
 if(data.checked!==requirements.length)throw Error('Incomplete RPC permissions audit');
 console.log(JSON.stringify({ok:true,callSites:requirements.length,audit:data},null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
