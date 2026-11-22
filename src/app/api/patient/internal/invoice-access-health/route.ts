import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@/lib/db/supabase';
export const dynamic='force-dynamic';
/** Server-to-server only. Absence of an observed failure is never proof of a successful patient read. */
export async function GET(request:NextRequest){
 const secret=process.env.INVOICE_ACCESS_WORKER_SECRET;
 if(!secret||request.headers.get('x-invoice-worker-secret')!==secret)return NextResponse.json({code:'not_authorized'},{status:401});
 const checkedAt=new Date().toISOString();
 const since=new Date(Date.now()-24*60*60*1000).toISOString();
 const result=await createServerClient().from('audit_log').select('neue_werte')
   .eq('tabelle','patient_invoice_read').gte('neue_werte->>checkedAt',since)
   .order('neue_werte->>checkedAt',{ascending:false}).limit(1);
 const headers={'Cache-Control':'no-store'};
 if(result.error)return NextResponse.json({status:'unknown',code:'invoice_monitor_unavailable',checkedAt},{status:503,headers});
 const failure=result.data?.[0]?.neue_werte as {checkedAt?:string}|undefined;
 return NextResponse.json({status:failure?'recent_failure':'unknown',code:failure?'invoice_source_unavailable':null,
  lastFailureAt:failure?.checkedAt??null,checkedAt,windowHours:24,patientAccessVerified:false},{headers});
}
