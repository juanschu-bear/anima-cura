import { normalizeContactPhone } from './animahost-contact-notices';

export type SenderKind = 'patient' | 'team' | 'group' | 'non_patient' | 'unknown';

export function classifySender(input: {
 jid: string;
 trustedPhone: string | null;
 hasPatient: boolean;
 practicePhone?: string | null;
 teamPhones?: string;
 nonPatientPhones?: string;
}): SenderKind {
 if (/^[\d-]+@g\.us$/.test(input.jid)) return 'group';
 const phone = normalizeContactPhone(input.trustedPhone);
 const includes = (value: string) => Boolean(phone && value.split(/[,;\n]/).some(item => normalizeContactPhone(item) === phone));
 if (includes([input.practicePhone ?? '',input.teamPhones ?? ''].join(','))) return 'team';
 if (includes(input.nonPatientPhones ?? '')) return 'non_patient';
 return input.hasPatient ? 'patient' : 'unknown';
}

export const quietSenderRule = /^sender:(?:team|group|non_patient|unknown_handoff)$/;

export function unknownSenderDecision(alreadyAsked: boolean, text: string) {
 return {action:'klaerfall' as const, rule:alreadyAsked?'sender:unknown_handoff':'sender:identify', text:alreadyAsked?'':text};
}
