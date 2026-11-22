import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createServerComponentClient} from '@/lib/db/supabase-server';
import {GET as patientInvoices} from '../route';
import {recordInvoiceEngagement} from '@/lib/services/invoice-engagement';
const input=z.discriminatedUnion('event',[
 z.object({event:z.literal('invoice_opened'),documentId:z.string().uuid()}),
 z.object({event:z.literal('app_installed')}),
]);
export async function POST(request:Request){
 const parsed=input.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({code:'invalid_request'},{status:400});
 const session=createServerComponentClient();
 const {data:{user},error}=await session.auth.getUser();
 if(error||!user)return NextResponse.json({code:'not_authenticated'},{status:401});
 // Reuse the actual invoice list's profile, membership and document checks.
 const invoices=await patientInvoices();
 if(!invoices.ok)return invoices;
 const body=await invoices.json();
 const documentId=parsed.data.event==='invoice_opened'?parsed.data.documentId:null;
 if(documentId&&!Array.isArray(body.rechnungen))return NextResponse.json({code:'invoice_source_unavailable'},{status:503});
 const invoice=documentId?body.rechnungen.find((r:{beleg?:{id?:string}})=>r.beleg?.id===documentId):null;
 if(documentId&&!invoice)return NextResponse.json({code:'invoice_not_found'},{status:body.belegeStatus==='unavailable'||body.hochgeladeneRechnungenStatus==='unavailable'?503:404});
 try{const recorded=await recordInvoiceEngagement(user.id,documentId,parsed.data.event,invoice?.patientId??invoice?.beleg?.patientId??null);return NextResponse.json({ok:recorded},{status:recorded?200:503});}
 catch{return NextResponse.json({code:'invoice_engagement_unavailable'},{status:503});}
}
