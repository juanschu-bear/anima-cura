export type ReferenceOrigin = 'practice' | 'research' | 'mixed';

// Attribution is documentary, never a live approval or a billable decision.
export function catalogOrigin(section: string, index: number): ReferenceOrigin {
  return section === 'kuerzel' && index < 16 ? 'practice' : 'research';
}
export function ruleOrigin(source: string): ReferenceOrigin {
  const practice = /Sabine|Praxis/i.test(source);
  const research = /BEMA|GOZ|KZV|Recherche/i.test(source);
  return practice && research ? 'mixed' : practice ? 'practice' : 'research';
}
export function matchesReference(query: string, value: unknown): boolean {
  const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('de-DE').replace(/ß/g,'ss');
  return normalize(JSON.stringify(value)).includes(normalize(query.trim()));
}
export function canReadPracticeReference(user: {role?:string|null;permissions?:Record<string,unknown>|null}) {
  return (user.permissions?.scribe_schreiben ?? ['admin','verwaltung'].includes(user.role ?? '')) === true;
}
