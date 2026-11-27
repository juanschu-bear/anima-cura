import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {processInvoiceContactEmail} from '@/lib/services/invoice-contact-email-intake';
const input=z.strictObject({requestId:z.string().uuid(),tenantId:z.string().uuid(),campaign:z.literal('invoice-email-q1-q3-2026'),chatJid:z.string().min(8).max(100),messageId:z.string().min(1).max(200),receivedAt:z.string().datetime(),email:z.string().trim().email(),patients:z.array(z.strictObject({patientId:z.string().uuid(),firstName:z.string().optional(),lastName:z.string().optional()})).min(1).max(20),actorId:z.string().uuid().nullable().optional()});
export async function POST(request:Request){
 const expected=Buffer.from(process.env.ANIMAHOST_LINE_SECRET??''),actual=Buffer.from(request.headers.get('authorization')?.replace(/^Bearer /,'')??'');
 if(!expected.length||actual.length!==expected.length||!timingSafeEqual(expected,actual))return NextResponse.json({code:'not_authorized'},{status:401});
 const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({code:'contact_email_invalid'},{status:400});
 try{return NextResponse.json(await processInvoiceContactEmail(parsed.data),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({code:'contact_email_unavailable'},{status:503});}
}
