const configuredReplyTo = process.env.PATIENT_EMAIL_REPLY_TO?.trim();

/**
 * Central support inbox for replies to all patient-facing transactional emails.
 * Keep this separate from the practice's day-to-day mailbox so technical access
 * problems can be triaged before the practice needs to act.
 */
export const PATIENT_EMAIL_REPLY_TO = configuredReplyTo || "praxisteam@animacura.io";
