import {NextResponse} from 'next/server';

export const runtime='nodejs';
const origin='https://anima-leitstand.vercel.app';
const tokenPattern=/^[A-Za-z0-9_-]{43}$/;
const passthrough=['content-type','content-disposition','set-cookie'] as const;
const noStore={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
async function smallBody(request:Request){
 const reader=request.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>1024){await reader.cancel();return null;}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return null;}
}

async function forward(request:Request,token:string,method:'GET'|'POST'){
 if(!tokenPattern.test(token))return NextResponse.json({code:'invoice_link_invalid'},{status:404,headers:noStore});
 const source=new URL(request.url),target=new URL(`/api/patient/immediate-invoice/${token}`,origin);
 for(const key of ['view','download','lang']){const value=source.searchParams.get(key);if(value)target.searchParams.set(key,value);}
 const body=method==='POST'?await smallBody(request):undefined;
 if(body===null)return NextResponse.json({code:'request_body_too_large'},{status:413,headers:noStore});
 const sessionCookie=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('immediate_invoice_session='));
 try{
  const upstream=await fetch(target,{method,headers:{
   ...(sessionCookie?{cookie:sessionCookie}:{}),
   ...(method==='POST'?{'content-type':'application/json'}:{})
  },body,cache:'no-store',signal:AbortSignal.timeout(15000)});
  const headers=new Headers(noStore);
  for(const key of passthrough){const value=upstream.headers.get(key);if(value)headers.set(key,value);}
  return new Response(upstream.body,{status:upstream.status,headers});
 }catch{return NextResponse.json({code:'invoice_access_unavailable'},{status:503,headers:noStore});}
}
export async function GET(request:Request,{params}:{params:{token:string}}){return forward(request,params.token,'GET');}
export async function POST(request:Request,{params}:{params:{token:string}}){return forward(request,params.token,'POST');}
