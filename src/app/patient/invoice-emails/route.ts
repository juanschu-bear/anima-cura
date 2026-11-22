import {createHash} from 'node:crypto';
import {createServerClient} from '@/lib/db/supabase';
import {t} from '@/lib/i18n';
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
/** GET only confirms intent: mail scanners must never unsubscribe a patient. */
export async function GET(request:Request){
 const url=new URL(request.url),locale=url.searchParams.get('lang')==='en'?'en':'de';
 if(!/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('token')??''))return new Response(t('invoiceFollowup.invalidLink',locale),{status:400,headers});
 return new Response(`<!doctype html><html lang="${locale}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anima Cura</title><body style="font:18px/1.6 system-ui;padding:32px;max-width:560px;margin:auto"><h1>${t('invoiceFollowup.unsubscribeTitle',locale)}</h1><p>${t('invoiceFollowup.unsubscribeBody',locale)}</p><form method="post"><button style="font:inherit;padding:12px">${t('invoiceFollowup.unsubscribeButton',locale)}</button></form></body></html>`,{headers});
}
export async function POST(request:Request){
 const url=new URL(request.url),token=url.searchParams.get('token')??'',locale=url.searchParams.get('lang')==='en'?'en':'de';
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return new Response(t('invoiceFollowup.invalidLink',locale),{status:400,headers});
 const db=createServerClient();
 const link=await db.from('invoice_email_optout_links').select('normalized_email').eq('token_hash',createHash('sha256').update(token).digest('hex')).maybeSingle();
 if(link.error)return new Response(t('invoiceFollowup.retry',locale),{status:503,headers});
 if(!link.data)return new Response(t('invoiceFollowup.invalidLink',locale),{status:400,headers});
 const saved=await db.from('invoice_email_preferences').upsert({normalized_email:link.data.normalized_email,reason:'unsubscribed'},{onConflict:'normalized_email',ignoreDuplicates:true});
 if(saved.error)return new Response(t('invoiceFollowup.retry',locale),{status:503,headers});
 return new Response(t('invoiceFollowup.unsubscribed',locale),{headers});
}
