import { z } from 'zod';
import { createServerClient } from '@/lib/db/supabase';
import { recipientConfirmationHash } from '@/lib/services/animahost-contact-changes';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const schema = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ confirmed: false }, { headers });
  try {
    const result = await createServerClient().rpc('animahost_confirm_invoice_recipient', { p_hash: recipientConfirmationHash(parsed.data.code) });
    if (result.error) throw Error('invoice_recipient_confirmation_unavailable');
    return Response.json({ confirmed: result.data === true }, { headers });
  } catch {
    return Response.json({ code: 'invoice_recipient_confirmation_unavailable' }, { status: 503, headers });
  }
}
