import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@/lib/db/supabase-server';
import { currentRooms, roomInputError, ScribeRoom } from './scribe-rooms';
import { t } from './i18n';

// Catalog shares the entry endpoint: GET reads choices, PATCH appends a room version.
// Never service-role bypass: table policies independently enforce staff/admin access.
export async function GET() {
  const db = createServerComponentClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await db.from('user_profiles').select('role,permissions').eq('id',user.id).single();
  if (!(profile?.permissions?.scribe_schreiben ?? ['admin','verwaltung'].includes(profile?.role))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await db.from('scribe_room_versions').select('id,room_id,version,name,active').order('version');
  if (error) return NextResponse.json({ error: t('scribe.room.loadError') }, { status: 503 });
  return NextResponse.json({ rooms: currentRooms(data as ScribeRoom[]), versions: data, canManage: profile?.role === 'admin' }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function PATCH(request: NextRequest) {
  const db = createServerComponentClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await db.from('user_profiles').select('role').eq('id',user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({error: t('scribe.room.invalid')}, {status:400}); }
  if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80 || typeof body.active !== 'boolean' || !Number.isSafeInteger(body.version) || body.version < 1 || roomInputError(body.room_id,true)) return NextResponse.json({error:t('scribe.room.invalid')},{status:400});
  const { error } = await db.from('scribe_room_versions').insert({room_id:body.room_id, version:body.version, name:body.name.trim(), active:body.active, created_by:user.id});
  if (error) return NextResponse.json({error:t('scribe.room.saveError')},{status:['23505','40001'].includes(error.code) ? 409 : 500});
  return NextResponse.json({ok:true});
}
