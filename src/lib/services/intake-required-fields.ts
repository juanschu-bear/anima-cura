// Pure, shared boundary validation. No database calls and no patient attribution.
import { pruefeEmail, pruefeTelefon, pruefePlz, pruefeHausnummer, pruefeName } from '../validation/feldpruefung';

export function validBirthDate(value: unknown, today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date())): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T[\d:.+Z-]+)?$/.test(raw)) return null;
  const date = raw.slice(0, 10), parsed = new Date(date + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date < '1900-01-01' || date > today) return null;
  if (raw.length > 10 && !Number.isFinite(Date.parse(raw))) return null;
  return date;
}

const patientFields = ['patient_vorname','patient_nachname','patient_anrede','patient_geburtsdatum','patient_geschlecht','patient_telefon','patient_strasse','patient_hausnummer','patient_plz','patient_wohnort','patient_email','patient_mobil'];
const healthFields = ['g_behandlung_aktuell','g_erkrankungen','g_medikamente','g_allergien','g_physio','g_hno','g_atmung','g_kfo_frueher','g_op_mund','g_kiefergelenk','g_kopfschmerzen','g_knirschen','g_logopaedie','g_unfaelle','g_lutschen','g_geschwister_kfo','g_instrument','g_roentgen_jahr','g_schwangerschaft','g_zaehneputzen'];
export function requiredIntakeFields(a: Record<string, unknown>, today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date())) {
  const date = validBirthDate(a.patient_geburtsdatum, today);
  const eighteenth = date ? `${Number(date.slice(0,4)) + 18}${date.slice(4)}` : null;
  const fields = ['versicherungsart','krankenkasse',...patientFields,'ist_selbstzahler','ist_vn','besuchsgrund',...healthFields,'ew_roentgen','abschluss_datum','abschluss_ort','unterschrift_sig1'];
  if (!eighteenth || eighteenth > today) fields.push('vp_vorname','vp_nachname','vp_anrede','vp_telefon');
  if (a.ist_selbstzahler === 'nein') fields.push('zahler_vorname','zahler_nachname','zahler_telefon');
  if (a.ist_vn === 'nein') fields.push('vn_vorname','vn_nachname');
  return fields;
}
export function validateIntakeAnswers(input: unknown, today?: string): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['answers'];
  const a = input as Record<string, unknown>;
  return requiredIntakeFields(a, today).filter(key => {
    if (key === 'unterschrift_sig1') return !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(String(a.unterschrift_versicherter ?? a.unterschrift_sig1 ?? ''));
    if (key === 'ew_roentgen') return a[key] !== true;
    if (key === 'patient_geburtsdatum') return !validBirthDate(a[key], today) || String(a[key]).length !== 10;
    const value = a[key];
    if (healthFields.includes(key)) return !(typeof value === 'boolean' || (typeof value === 'string' && value.trim()));
    if (typeof value !== 'string' || !value.trim()) return true;
    if (key.endsWith('_vorname') || key.endsWith('_nachname')) return !pruefeName(value).ok;
    if (key.endsWith('_telefon') || key === 'patient_mobil') return !pruefeTelefon(value).ok;
    if (key === 'patient_email') return !pruefeEmail(value).ok;
    if (key === 'patient_plz') return !pruefePlz(value).ok;
    if (key === 'patient_hausnummer') return !pruefeHausnummer(value).ok;
    if (key === 'ist_selbstzahler' || key === 'ist_vn') return !['ja','nein'].includes(value);
    if (key === 'abschluss_datum') return !validBirthDate(value, today) || value.length !== 10;
    return false;
  });
}
