/** Read-only server-build check: no generation, patient input, key values or fingerprints. */
export async function checkDirectKeys(env,request=fetch){
 const live=env.ANIMAHOST_ANTHROPIC_LIVE_KEY?.trim();
 const test=env.ANIMAHOST_ANTHROPIC_TEST_KEY?.trim();
 const results=[];
 for(const [scope,key] of [['live',live],['test',test]]){
  if(!key){results.push({scope,present:false,status:'missing'});continue;}
  try{
   const response=await request('https://api.anthropic.com/v1/models?limit=100',{
    method:'GET',headers:{'x-api-key':key,'anthropic-version':'2023-06-01'},
    signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store',
   });
   const body=await response.json().catch(()=>null);
   const message=typeof body?.error?.message==='string'?body.error.message.toLowerCase():'';
   const errorKind=response.ok?null:/credit|balance|billing/.test(message)?'billing':/api.?key|authentication/.test(message)?'authentication':/disabled|suspend/.test(message)?'account_disabled':/limit|parameter|query/.test(message)?'request_parameter':'other';
   results.push({scope,present:true,status:response.status,errorKind,keyFormat:/^sk-ant-/.test(key),haikuModels:Array.isArray(body?.data)?body.data
    .filter(model=>typeof model.id==='string'&&/^claude-haiku-[a-z0-9.-]+$/.test(model.id)).map(model=>model.id):[]});
  }catch{results.push({scope,present:true,status:'unavailable'});}
 }
 return {generationRequests:0,distinct:!!live&&!!test&&live!==test,results};
}
if(process.env.VERCEL==='1'&&process.env.ANIMAHOST_DIRECT_KEY_CHECK==='1'){
 console.log('ANIMAHOST_DIRECT_KEY_CHECK '+JSON.stringify(await checkDirectKeys(process.env)));
}
