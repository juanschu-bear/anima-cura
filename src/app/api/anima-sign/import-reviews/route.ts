import { NextResponse } from 'next/server';
import { requirePraxisRole } from '@/lib/require-praxis';
import { createServerClient } from '@/lib/db/supabase';

export async function GET(request: Request) {
  const denied = await requirePraxisRole(['admin','verwaltung']);
  if (denied) return denied;
  const pageValue = new URL(request.url).searchParams.get('page') ?? '0';
  if (!/^\d{1,6}$/.test(pageValue)) return NextResponse.json({ error: 'invalid_page' }, { status: 400 });
  const page = Number(pageValue), size = 15;
  const { data, error, count } = await createServerClient().from('patient_import_reviews')
    .select('id,external_id,first_name,last_name,reason,created_at,last_seen_at', { count: 'exact' })
    .eq('state','open').order('created_at').order('id').range(page * size, page * size + size - 1);
  if (error || count === null) return NextResponse.json({ error: 'import_review_read_failed' }, { status: 503 });
  return NextResponse.json({ items: data, total: count, page, pageSize: size }, { headers: { 'Cache-Control': 'no-store' } });
}
