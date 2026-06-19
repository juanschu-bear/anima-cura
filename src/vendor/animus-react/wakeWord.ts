export type WakeWordState = "unsupported" | "idle" | "starting" | "listening" | "detected" | "error";

export const DEFAULT_WAKE_WORD_PHRASES = ["hey animus"];

function transliterate(value: string): string {
  return value
    .replace(/ä/gi, "ae")
    .replace(/ö/gi, "oe")
    .replace(/ü/gi, "ue")
    .replace(/ß/gi, "ss");
}

export function normalizeWakeWordInput(value: string): string {
  return transliterate(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wakeWordMatchesTranscript(transcript: string, phrases: readonly string[] = DEFAULT_WAKE_WORD_PHRASES): boolean {
  const normalizedTranscript = normalizeWakeWordInput(transcript);
  if (!normalizedTranscript) return false;
  const haystack = ` ${normalizedTranscript} `;
  return phrases.some((phrase) => {
    const normalizedPhrase = normalizeWakeWordInput(phrase);
    return normalizedPhrase ? haystack.includes(` ${normalizedPhrase} `) : false;
  });
}
