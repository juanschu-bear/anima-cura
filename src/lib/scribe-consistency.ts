import { z } from 'zod';

// Deterministic consistency check, not a tariff/clinical/quarter entitlement decision.
// No model, inferred fee, write, override flag or silent repair.
const short = z.string().trim().min(1).max(400);
const selections = z.record(z.record(z.array(z.number().int().nonnegative()).max(200)));
export const scribeConsistencyInput = z.object({
  vorlage_id: short,
  behandlungsart: short,
  termin_typ: z.string().min(1).max(2000),
  text: z.string().trim().min(1).max(50000),
  auswahl: selections.nullish().transform(v => v ?? {}),
  variablen: z.record(z.unknown()).nullish().transform(v => v ?? {}),
  zaehne: z.array(z.string().regex(/^[1-8][1-8]$/)).max(52).nullish().transform(v => v ?? []),
  positionen: z.array(z.object({ code: short, text: z.string().trim().min(1).max(2000), anzahl: z.number().int().positive().max(10000) })).max(500),
});
const rule = z.object({
  code: short, text: z.string().min(1).max(2000),
  count: z.enum(['zaehne']).optional(),
  if: z.object({ g: short, i: z.number().int().nonnegative() }).optional(),
});
export const scribeConsistencyTemplate = z.object({
  id: short, behandlungsart: short, termin_typ: short,
  struktur: z.object({
    template: z.array(z.union([z.string(), z.object({ g: short })])),
    groups: z.record(z.object({
      type: z.enum(['single', 'multi']), req: z.boolean().optional(),
      opts: z.array(z.object({ t: z.string(), id: z.string().optional() })),
    })),
  }),
  positionen: z.array(rule),
});
export type ScribeConsistencyInput = z.infer<typeof scribeConsistencyInput>;
export type ScribeConsistencyTemplate = z.infer<typeof scribeConsistencyTemplate>;
export type ScribeConsistencyIssue = {
  code: string;
  scope: 'input' | 'template' | 'selection' | 'text' | 'positions' | 'source';
  module?: string;
  group?: string;
  optionIndex?: number;
  positionIndex?: number;
  ruleIndex?: number;
  jaw?: 'OK' | 'UK';
};
export type ScribeConsistencyResult = {
  ruleVersion: 'scribe-consistency-v1';
  status: 'blocked' | 'no_detected_conflict';
  canConfirm: boolean;
  billingApproved: false;
  coverage: readonly ['template_references', 'selection_text', 'position_multiset', 'wire_change'];
  issues: ScribeConsistencyIssue[];
};
export function consistencyResult(issues: ScribeConsistencyIssue[]): ScribeConsistencyResult {
  return { ruleVersion: 'scribe-consistency-v1', status: issues.length ? 'blocked' : 'no_detected_conflict',
    canConfirm: issues.length === 0, billingApproved: false,
    coverage: ['template_references', 'selection_text', 'position_multiset', 'wire_change'], issues };
}
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const wireCode = (s: string) => /^(?:BEMA\s*(?:127[ab]|128[abc]|129)|GOZ\s*(?:6140|6150))$/i.test(s.trim());
const entryKey = (p: {code: string; text: string; anzahl: number}) => JSON.stringify([norm(p.code).replace(/\s/g, ''), norm(p.text), p.anzahl]);

// Limited grammar on purpose: negation/planning/unknown jaw requires review,
// not a claim that any arbitrary clinical free text has been understood.
function wireMentions(text: string) {
  const mentions: Array<{jaw: 'OK' | 'UK' | null; performed: boolean; negated: boolean}> = [];
  for (const sentence of text.split(/[.!?;\n]+/)) {
    if (!/\bbogenwechsel\b|\bbogen\s+(?:gewechselt|wechseln)\b/i.test(sentence)) continue;
    const negated = /\b(?:kein\w*|nicht|ohne)\b/i.test(sentence);
    const performed = !negated && !/\b(?:geplant|planen|naechst\w*|nächst\w*|soll\w*|eventuell|ggf|empfohlen|termin|nt)\b/i.test(sentence);
    const jaws: Array<'OK' | 'UK'> = /\b(?:ok|oberkiefer)\b/i.test(sentence) ? ['OK'] : [];
    if (/\b(?:uk|unterkiefer)\b/i.test(sentence)) jaws.push('UK');
    if (!jaws.length) mentions.push({jaw:null,performed,negated});
    else jaws.forEach(jaw => mentions.push({jaw,performed,negated}));
  }
  return mentions;
}

export function assessScribeConsistency(raw: unknown, rawTemplates: unknown[]): ScribeConsistencyResult {
  const parsed = scribeConsistencyInput.safeParse(raw);
  if (!parsed.success) return consistencyResult([{code:'input_invalid',scope:'input'}]);
  const input = parsed.data;
  const issues: ScribeConsistencyIssue[] = [];
  const add = (issue: ScribeConsistencyIssue) => issues.push(issue);
  const slugs = input.termin_typ.split('+');
  if (slugs.length > 32 || slugs.some(s => !s) || new Set(slugs).size !== slugs.length)
    return consistencyResult([{code:'module_selection_invalid',scope:'selection'}]);
  if (new Set(input.zaehne).size !== input.zaehne.length) add({code:'teeth_duplicate',scope:'input'});
  const templates: ScribeConsistencyTemplate[] = [];
  for (const value of rawTemplates) {
    const template = scribeConsistencyTemplate.safeParse(value);
    if (!template.success) add({code:'template_invalid',scope:'template'});
    else templates.push(template.data);
  }
  const text = norm(input.text);
  const expected: Array<{code: string; text: string; anzahl: number}> = [];
  const mappedWireJaws = new Set<string>();

  function fill(value: string, module: string) {
    return value.replace(/\{([^}]+)\}/g, (_, key: string) => {
      if (key === 'zaehne') {
        const sides = input.variablen.zahn_seiten as Record<string, unknown> | undefined;
        return input.zaehne.map(n => sides?.[n] === 'innen' ? `${n} (${Number(n) < 30 ? 'palatinal' : 'lingual'})` : n).join(', ');
      }
      const field = ({von:'schienen_von',bis:'schienen_bis',bogen:'bogen'} as Record<string,string>)[key];
      const value = field ? input.variablen[field] : undefined;
      if (typeof value === 'string' && value.trim()) return value;
      add({code:'text_variable_unresolved',scope:'text',module});
      return '?';
    });
  }

  for (const slug of slugs) {
    const matches = templates.filter(t => t.termin_typ === slug && t.behandlungsart === input.behandlungsart);
    if (matches.length !== 1) { add({code:'template_missing_or_ambiguous',scope:'template',module:slug}); continue; }
    const template = matches[0];
    if (slug === slugs[0] && template.id !== input.vorlage_id) add({code:'template_identity_mismatch',scope:'template',module:slug});
    const groups = template.struktur.groups;
    const selected = input.auswahl[slug] ?? {};
    const groupNames = new Set(Object.keys(groups));
    const rendered: string[] = [];
    for (const [name, indices] of Object.entries(selected)) {
      const group = groupNames.has(name) ? groups[name] : undefined;
      if (!group || indices.some(i => i >= group.opts.length) || new Set(indices).size !== indices.length || (group.type === 'single' && indices.length > 1)) {
        add({code:'selection_invalid',scope:'selection',module:slug,group:name});
      }
    }
    for (const segment of template.struktur.template) {
      if (typeof segment === 'string') { rendered.push(segment); continue; }
      const group = groupNames.has(segment.g) ? groups[segment.g] : undefined;
      if (!group) { add({code:'template_text_reference_invalid',scope:'template',module:slug,group:segment.g}); continue; }
      for (const index of selected[segment.g] ?? []) {
        const option = group.opts[index];
        if (!option) continue;
        const sentence = fill(option.t, slug);
        rendered.push(sentence + ' ');
        if (norm(sentence) && !text.includes(norm(sentence))) add({code:'selected_text_missing',scope:'text',module:slug,group:segment.g,optionIndex:index});
      }
    }
    const fragment = norm(rendered.join(''));
    if (fragment && !text.includes(fragment)) add({code:'template_text_mismatch',scope:'text',module:slug});

    template.positionen.forEach((position, ruleIndex) => {
      const condition = position.if;
      if (condition && (!groupNames.has(condition.g) || !groups[condition.g].opts[condition.i])) {
        add({code:'template_rule_reference_invalid',scope:'template',module:slug,group:condition.g,ruleIndex}); return;
      }
      if (condition && !(selected[condition.g] ?? []).includes(condition.i)) return;
      // A selected billing option not rendered into the text has no evidence.
      if (condition && !template.struktur.template.some(s => typeof s !== 'string' && s.g === condition.g))
        add({code:'position_without_text_binding',scope:'template',module:slug,group:condition.g,ruleIndex});
      const count = position.count === 'zaehne' ? input.zaehne.length : 1;
      if (!count) add({code:'position_quantity_unproven',scope:'positions',module:slug,ruleIndex});
      expected.push({code:position.code,text:position.text,anzahl:count});
      if (wireCode(position.code)) {
        const evidence = condition ? fill(groups[condition.g].opts[condition.i].t, slug) : rendered.join('');
        const evidenceJaws = wireMentions(evidence).filter(m => m.performed && m.jaw);
        if (new Set(evidenceJaws.map(m => m.jaw)).size > count)
          add({code:'wire_jaw_quantity_unproven',scope:'positions',module:slug,ruleIndex});
        else for (const mention of evidenceJaws) mappedWireJaws.add(mention.jaw!);
      }
    });
  }

  // Multiset comparison preserves duplicate lines/counts across stacked modules.
  const remaining = expected.map(entryKey);
  input.positionen.forEach((position, positionIndex) => {
    const index = remaining.indexOf(entryKey(position));
    if (index < 0) add({code:'position_unexpected_or_changed',scope:'positions',positionIndex});
    else remaining.splice(index, 1);
  });
  if (remaining.length) add({code:'expected_position_missing',scope:'positions'});

  const mentions = wireMentions(input.text);
  const done = mentions.filter(m => m.performed);
  for (const mention of done) {
    if (!mention.jaw) add({code:'wire_location_unresolved',scope:'text'});
    else {
      if (!mappedWireJaws.has(mention.jaw)) add({code:'wire_position_unmapped',scope:'positions',jaw:mention.jaw});
      // Also detect the common separate statement "Kein Wechsel UK".
      const denied = new RegExp(`(?:kein(?:en)?|nicht|ohne)\\s+(?:bogen)?wechsel\\s+(?:im\\s+)?${mention.jaw}\\b`, 'i').test(input.text);
      if (denied || mentions.some(m => m.negated && m.jaw === mention.jaw)) add({code:'wire_text_conflict',scope:'text',jaw:mention.jaw});
    }
  }
  // Individual wire codes can describe insertion/removal without a change.
  // Do not infer entitlement: flag known contradicting change-only text only.
  if (mentions.length && !done.length && input.positionen.some(p => wireCode(p.code)))
    add({code:'wire_position_without_performed_change',scope:'positions'});
  return consistencyResult(issues);
}
