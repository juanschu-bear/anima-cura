import { t } from '@/lib/i18n';
export type ScribeRoom = { id: string; room_id: string; version: number; name: string; active: boolean };
export function currentRooms(rows: ScribeRoom[]): ScribeRoom[] {
  const latest = new Map<string, ScribeRoom>();
  for (const row of rows) if (!latest.has(row.room_id) || latest.get(row.room_id)!.version < row.version) latest.set(row.room_id, row);
  return Array.from(latest.values()).sort((a,b) => a.name.localeCompare(b.name, 'de'));
}
export function roomInputError(value: unknown, required: boolean): string | null {
  if (value == null || value === '') return required ? t('scribe.room.required') : null;
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? null : t('scribe.room.invalid');
}
