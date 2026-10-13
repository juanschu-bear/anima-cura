const supportAddress = "praxisteam@animacura.io";
const configuredReplyTo = process.env.PATIENT_EMAIL_REPLY_TO?.trim();
const configuredFrom = process.env.PATIENT_EMAIL_FROM?.trim();

/**
 * Central support inbox for replies to all patient-facing transactional emails.
 * Keep this separate from the practice's day-to-day mailbox so technical access
 * problems can be triaged before the practice needs to act.
 */
export const PATIENT_EMAIL_REPLY_TO = configuredReplyTo || supportAddress;

/** Human-readable sender for all patient communication. */
export const PATIENT_EMAIL_FROM = configuredFrom || `Praxis Dr. Schubert - Anima Cura <${supportAddress}>`;
