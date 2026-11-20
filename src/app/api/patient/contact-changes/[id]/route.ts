import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/db/supabase';
import { createServerComponentClient } from '@/lib/db/supabase-server';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });

async function load(id: string) {
  if (!z.string().uuid().safeParse(id).success) return reply({ code: 'contact_change_not_found' }, 404);
  const session = createServerComponentClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return reply({ code: 'not_authenticated' }, 401);
  const db = createServerClient();
  const [{ data: profile, error: profileError }, { data: change, error: changeError }] = await Promise.all([
    db.from('user_profiles').select('role,patient_id').eq('id', user.id).maybeSingle(),
    db.from('animahost_contact_changes').select('patient_id,state,proposed,created_at').eq('id', id).maybeSingle(),
  ]);
  if (profileError || changeError) return reply({ code: 'contact_change_unavailable' }, 503);
  if (profile?.role !== 'patient' || !change?.proposed?.email) return reply({ code: 'contact_change_not_found' }, 404);
  if (profile.patient_id !== change.patient_id) {
    const membership = await db.from('patient_access_memberships').select('patient_id').eq('user_id', user.id).eq('patient_id', change.patient_id).maybeSingle();
    if (membership.error) return reply({ code: 'contact_change_unavailable' }, 503);
    if (!membership.data) return reply({ code: 'contact_change_not_found' }, 404);
  }
  if (change.state === 'pending' && Date.parse(change.created_at) < Date.now() - 86_400_000) return reply({ code: 'contact_change_expired' }, 409);
  return { user, change, db };
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const loaded = await load(params.id);
  return loaded instanceof Response ? loaded : reply({ id: params.id, state: loaded.change.state, proposed: loaded.change.proposed });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (request.headers.get('origin') !== request.nextUrl.origin) return reply({ code: 'invalid_origin' }, 403);
  const loaded = await load(params.id);
  if (loaded instanceof Response) return loaded;
  const result = await loaded.db.rpc('animahost_contact_change', { p_tenant: null, p_message: null, p_patient: null,
    p_patch: null, p_request: params.id, p_user: loaded.user.id });
  if (!result.error) return reply(result.data);
  const reason = ['contact_change_expired', 'contact_change_stale', 'contact_email_conflict'].find(code => result.error.message.includes(code));
  return reply({ code: reason ?? 'contact_change_unavailable' }, reason ? 409 : 503);
}
