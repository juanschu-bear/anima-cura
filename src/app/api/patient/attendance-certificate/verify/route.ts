import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createServerClient } from '@/lib/db/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9_-]{32}$/) }).strict();
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ valid: false }, { headers });
  try {
    const hash = createHash('sha256').update(parsed.data.code).digest('hex');
    const result = await createServerClient().from('animahost_attendance_certificates')
      .select('service_date,service_time').eq('verification_hash', hash).is('revoked_at', null).maybeSingle();
    if (result.error) throw Error('certificate_verification_unavailable');
    if (!result.data) return Response.json({ valid: false }, { headers });
    return Response.json({ valid: true, date: result.data.service_date, time: result.data.service_time.slice(0, 5) }, { headers });
  } catch {
    return Response.json({ code: 'certificate_verification_unavailable' }, { status: 503, headers });
  }
}
