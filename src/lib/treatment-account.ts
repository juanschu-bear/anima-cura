/** Read model only. No inference here releases a charge, changes an identity or sends mail. */
export type Evidence = { system: string; recordId: string; version: string; locator: string; checksum?: string };
export type ClinicalState = 'performed' | 'planned' | 'negated' | 'unclear';
export type TreatmentEvent = {
  id: string; patientId: string; date: string; text: string; component: string | null;
  jaw: 'OK' | 'UK' | 'both' | null; teeth: string[]; material: string | null;
  quantity: number | null; state: ClinicalState; copied: boolean;
  confirmed: boolean; evidence: Evidence; author: string | null;
};
export type TreatmentPlan = {
  id: string; revision: number; valid_from: string; valid_to: string | null;
  treatment_start: string | null; jaws: string | null; insurer: string | null;
  insurance: string | null; quotas: unknown[]; pauses: { confirmed: boolean }[];
  confirmed_by: string | null; confirmed_at: string | null;
  history: { from?: string; through?: string; complete?: boolean; confirmedBy?: string; confirmedAt?: string };
  source: Evidence;
};
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function treatmentQuarter(plan: TreatmentPlan | null, date: string): number | null {
  if (!plan?.confirmed_by || !plan.confirmed_at || !validDate(plan.treatment_start) || !validDate(date)
    || date < plan.treatment_start || plan.pauses.some(pause => !pause.confirmed)) return null;
  const index = (day: string) => Number(day.slice(0, 4)) * 4 + Math.floor((Number(day.slice(5, 7)) - 1) / 3);
  return index(date) - index(plan.treatment_start) + 1;
}
export function currentPlan(plans: TreatmentPlan[], date: string): TreatmentPlan | null {
  const candidates = plans.filter(plan => plan.valid_from <= date && (!plan.valid_to || plan.valid_to >= date));
  // A version chain has one logical ID. Overlapping distinct plans are a conflict, never an arbitrary pick.
  if (new Set(candidates.map(plan => plan.id)).size !== 1) return null;
  return candidates.sort((a, b) => b.revision - a.revision)[0] ?? null;
}
export function historyKnown(plan: TreatmentPlan | null): boolean {
  const h = plan?.history;
  return !!(h?.complete && validDate(h.from) && validDate(h.through) && h.from <= h.through
    && h.confirmedBy && h.confirmedAt);
}

export type ScribeEntry = {
  id: string; patient_id: string; termin_datum: string; text: string | null; version: number;
  status: string; bestaetigt_von: string | null; zaehne: string[] | null;
  variablen: Record<string, unknown> | null; positionen: unknown; vorlage_id: string | null;
};
// Prototype 15.10.: sentence boundaries protect shorthand and ordinal numbers.
export function splitEntry(text: string): string[] {
  const protectedText = text.replace(/\b(Bg|Br|Bd|Abdr|Sep|ca|bzw|ggf|evtl|Nr|Pos|Wv)\./g, '$1§')
    .replace(/\bz\.\s?B\./g, 'z§B§').replace(/\bo\.\s?B\./g, 'o§B§').replace(/\bn\.\s?T\./gi, 'n§T§');
  return protectedText.split(/(?<=[A-Za-zÄÖÜäöüß,)€])\.(?=\s|$)|;|\n+/)
    .map(part => part.replace(/§/g, '.').trim()).filter(Boolean);
}
export function scribeEvents(entry: ScribeEntry): TreatmentEvent[] {
  return splitEntry(entry.text ?? '').map((text, index) => {
    const expanded = text.replace(/\bBg\b\.?/g, 'Bogen').replace(/\bBr\b\.?/g, 'Bracket').replace(/\bBd\b\.?/g, 'Band');
    const copied = /übernommen|uebernommen|vorbefund|alte notiz|kopiert/i.test(expanded);
    const state: ClinicalState = /\b(kein|keine|nicht|ohne)\b/i.test(expanded) ? 'negated'
      : /nächste[nmr]?\s+(termin|sitzung|mal)|nächster termin|beim nächsten|geplant|später|\bsoll\b|vorgesehen|\bn\.?\s*T\.?\b/i.test(expanded) ? 'planned'
      : /\?|\bevtl|eventuell|vielleicht|unklar/i.test(expanded) ? 'unclear'
      : /eingesetzt|eingegliedert|einligiert|gesetzt|geklebt|gewechselt|eingebogen|angebracht|zementiert|entfernt|ausgegliedert|bdex|debond|entbändert|separiert|abgeformt|gescannt|angefertigt|erstellt|ausgewertet|aufgenommen|durchgeführt|gemacht|erfolgt|angepasst/i.test(expanded) ? 'performed' : 'unclear';
    const component = /röhrchen|roehrchen|\btubes?\b/i.test(expanded) ? 'tube'
      : /teilbogen|segmentbogen/i.test(expanded) ? 'partial_arch'
      : /bogen|bögen|loop|schlaufe|reverse/i.test(expanded) ? 'arch'
      : /bracket|attachment/i.test(expanded) ? 'bracket'
      : /\bband\b|bänder|baender/i.test(expanded) ? 'band' : null;
    const upper = /\bOK\b|oberkiefer/i.test(expanded), lower = /\bUK\b|unterkiefer/i.test(expanded);
    const jaw = upper && lower ? 'both' : upper ? 'OK' : lower ? 'UK' : null;
    // Do not attach entry-wide teeth, default quantities or template selections to an arbitrary sentence.
    const teeth = Array.from(new Set(expanded.match(/(?<![\d.,])\b(?:[1-4][1-8]|[5-8][1-5])\b(?![\d.,])/g) ?? []));
    const material = /edelstahl|\bstahl\b|\bSS\b/i.test(expanded) ? 'Edelstahl'
      : /niti|nickel.?titan/i.test(expanded) ? 'NiTi' : /\bTMA\b|beta.?titan/i.test(expanded) ? 'TMA' : null;
    return { id: `scribe:${entry.id}:${entry.version}:${index}`, patientId: entry.patient_id,
      date: entry.termin_datum, text, component, jaw, teeth, material, quantity: null, state, copied,
      confirmed: false, author: entry.bestaetigt_von,
      evidence: { system: 'scribe', recordId: entry.id, version: String(entry.version), locator: `sentence:${index}` } };
  });
}

export type Identity = { id: string; vorname: string; nachname: string; geburtsdatum: string; ivoris_id: string | null };
export type IdentityInput = { first: string; last: string; dob: string | null; patientId?: string | null; externalId?: string | null };
export type IdentityResolution = { status: 'matched' | 'possible_duplicate' | 'new_candidate' | 'lookup_failed'; patientId: string | null; candidates: string[]; complete: boolean; reason: string };
const norm = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
const variants = (text: string) => [norm(text).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'), norm(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss')];
/** Existing numbered practice records only. Missing DOB is not fabricated and cannot authorize creation. */
export function resolveTreatmentListIdentity(input: { first: string; last: string; patientNumber: string }, candidates: { id: string; vorname: string; nachname: string; ivoris_nummer: string | null }[], complete: boolean): IdentityResolution {
  const matches = candidates.filter(patient => patient.ivoris_nummer === input.patientNumber);
  const matched = complete && matches.length === 1 && norm(matches[0].vorname) === norm(input.first) && norm(matches[0].nachname) === norm(input.last);
  return { status: !complete ? 'lookup_failed' : matched ? 'matched' : 'possible_duplicate', patientId: matched ? matches[0].id : null,
    candidates: matches.map(patient => patient.id), complete, reason: matched ? 'existing_number_and_full_name' : 'number_or_name_review' };
}
export function resolveTreatmentIdentity(input: IdentityInput, candidates: Identity[], complete: boolean): IdentityResolution {
  const out = (status: IdentityResolution['status'], reason: string, patientId: string | null = null): IdentityResolution =>
    ({ status, reason, patientId, candidates: candidates.map(p => p.id), complete });
  if (!complete) return out('lookup_failed', 'incomplete_search');
  if (!input.first.trim() || !input.last.trim() || !validDate(input.dob)) return out('possible_duplicate', 'missing_identity');
  const same = (a: string, b: string) => norm(a) === norm(b);
  const exact = candidates.filter(p => p.geburtsdatum === input.dob &&
    ((same(input.first, p.vorname) && same(input.last, p.nachname)) || (same(input.first, p.nachname) && same(input.last, p.vorname))));
  const related = candidates.filter(p => {
    const eq = (a: string, b: string) => variants(a).some(v => variants(b).includes(v));
    return (eq(input.first, p.vorname) && eq(input.last, p.nachname)) || (eq(input.first, p.nachname) && eq(input.last, p.vorname));
  });
  const trusted = candidates.filter(p => p.id === input.patientId || (input.externalId && p.ivoris_id === input.externalId));
  if (exact.length === 1 && !related.some(p => p.id !== exact[0].id) && !trusted.some(p => p.id !== exact[0].id)) {
    const hit = exact[0];
    if ((input.patientId && input.patientId !== hit.id) || (input.externalId && input.externalId !== hit.ivoris_id)) return out('possible_duplicate', 'stable_id_conflict');
    return out('matched', 'unique_name_and_dob', hit.id);
  }
  if (exact.length || related.length || trusted.length) return out('possible_duplicate', 'ambiguous_identity');
  if (input.patientId || input.externalId) return out('possible_duplicate', 'stable_id_not_found');
  return out('new_candidate', 'complete_search_no_match');
}
