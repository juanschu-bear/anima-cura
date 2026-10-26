import ts from 'typescript';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';

export type RpcRequirement={name:string;signature:string;role:'service_role'|'authenticated'|'anon';file:string};
export type RpcContracts={version:1;files:Array<{file:string;sha256:string;proof:string;calls:Omit<RpcRequirement,'file'>[]}>;proofs:Array<{file:string;sha256:string}>;boundaries:string[]};
export const sourceHash=(text:string)=>createHash('sha256').update(text).digest('hex');

export function rpcNames(source:string,file:string):string[]{
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const declarations=new Map<string,ts.Expression>(),ambiguous=new Set<string>();
 const collect=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer){
  // Shadowed dynamic names are ambiguous and must be rewritten to literal RPC names.
  if(declarations.has(node.name.text)){ambiguous.add(node.name.text);declarations.delete(node.name.text);}else if(!ambiguous.has(node.name.text))declarations.set(node.name.text,node.initializer);
 }ts.forEachChild(node,collect);};collect(tree);
 const names=(node:ts.Expression,seen=new Set<string>()):string[]=>{
  if(ts.isStringLiteralLike(node))return [node.text];
  if(ts.isParenthesizedExpression(node))return names(node.expression,seen);
  if(ts.isConditionalExpression(node))return [...names(node.whenTrue,seen),...names(node.whenFalse,seen)];
  if(ts.isIdentifier(node)&&!seen.has(node.text)&&declarations.has(node.text))return names(declarations.get(node.text)!,new Set([...Array.from(seen),node.text]));
  throw Error(`${file}: dynamic RPC target has no finite reviewed contract`);
 };
 const found:string[]=[];
 const visit=(node:ts.Node)=>{
  const rpc=(ts.isPropertyAccessExpression(node)&&node.name.text==='rpc')||(ts.isElementAccessExpression(node)&&node.argumentExpression&&ts.isStringLiteralLike(node.argumentExpression)&&node.argumentExpression.text==='rpc');
  if(rpc){
   if(!ts.isCallExpression(node.parent)||node.parent.expression!==node)throw Error(`${file}: extracted RPC method cannot be verified`);
   if(!node.parent.arguments[0])throw Error(`${file}: RPC name missing`);
   found.push(...names(node.parent.arguments[0]));
  }
  ts.forEachChild(node,visit);
 };visit(tree);return found.sort();
}

export async function sourceFiles(root:string):Promise<string[]>{
 const result:string[]=[];
 const walk=async(dir:string)=>{for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){
  const file=path.posix.join(dir,entry.name);
  if(entry.isDirectory()){if(!['__tests__','node_modules','.next'].includes(entry.name))await walk(file);}
  else if(/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)&&!/(?:\.test\.|\.spec\.|\.d\.ts$)/.test(file))result.push(file);
 }};
 for(const dir of ['src','scripts'])await walk(dir);return result.sort();
}

export async function verifyRpcContracts(root:string,contracts:RpcContracts):Promise<RpcRequirement[]>{
 const requirements:RpcRequirement[]=[];
 const seen=new Set<string>(),proofs=new Map([...contracts.files,...contracts.proofs].map(p=>[p.file,p.sha256]));
 for(const file of await sourceFiles(root)){
  if(file==='scripts/lib/rpc-contract.ts')continue;
  const source=await readFile(path.join(root,file),'utf8');
  const names=rpcNames(source,file);
  const hasBoundary=contracts.boundaries.some(name=>new RegExp(`\\b${name}\\b`).test(source));
  if(hasBoundary&&!proofs.has(file))throw Error(`${file}: unreviewed caller of an injected database boundary`);
  if(!names.length)continue;
  const contract=contracts.files.find(c=>c.file===file);
  if(!contract||contract.sha256!==sourceHash(source))throw Error(`${file}: RPC caller/role proof missing or changed; review actual client and update contract`);
  if(!contract.proof.trim())throw Error(`${file}: role rationale missing`);
  const declared=contract.calls.map(c=>c.name).sort();
  if(JSON.stringify(names)!==JSON.stringify(declared))throw Error(`${file}: RPC inventory differs from contract`);
  for(const call of contract.calls){
   if(!['service_role','authenticated','anon'].includes(call.role)||!call.signature.startsWith('public.'+call.name+'('))throw Error(`${file}: invalid RPC role/signature`);
   requirements.push({...call,file});
  }seen.add(file);
 }
 for(const file of contracts.files)if(!seen.has(file.file))throw Error(`${file.file}: stale RPC contract`);
 for(const proof of contracts.proofs)if(sourceHash(await readFile(path.join(root,proof.file),'utf8'))!==proof.sha256)throw Error(`${proof.file}: database client provenance changed`);
 return requirements;
}

export function assertRpcAudit(data:unknown):void{
 const r=data as {ok?:unknown;checked?:unknown;violations?:unknown};
 if(!r||r.ok!==true||!Array.isArray(r.violations)||r.violations.length!==0||typeof r.checked!=='number'||r.checked<1)throw Error(`RPC permissions audit failed: ${JSON.stringify(data)}`);
}
