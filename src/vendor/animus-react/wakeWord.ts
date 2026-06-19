export type WakeWordState = "unsupported" | "idle" | "starting" | "listening" | "detected" | "error";

export const DEFAULT_WAKE_WORD_PHRASES = ["hey animus"];

const WAKE_WORD_ALIASES = [
  "animus",
  "annimus",
  "animis",
  "animes",
  "anima",
  "animas",
  "animuss",
  "animals",
  "animos",
  "animus",
] as const;

const WAKE_PREFIXES = ["hey", "heya", "hallo", "ok", "okay"] as const;

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
  if (phrases.some((phrase) => {
    const normalizedPhrase = normalizeWakeWordInput(phrase);
    return normalizedPhrase
      ? normalizedTranscript === normalizedPhrase || normalizedTranscript.startsWith(`${normalizedPhrase} `)
      : false;
  })) {
    return true;
  }

  const tokens = normalizedTranscript.split(" ").filter(Boolean);
  if (tokens.length < 2 || tokens.length > 6) return false;

  const first = tokens[0] ?? "";
  const second = tokens[1] ?? "";
  const third = tokens[2] ?? "";
  const prefixLooksLikeWake = WAKE_PREFIXES.some((prefix) => levenshtein(first, prefix) <= 1);
  if (!prefixLooksLikeWake) return false;

  const aliasLooksLikeWakeWord = WAKE_WORD_ALIASES.some((alias) => levenshtein(second, alias) <= 2);
  if (aliasLooksLikeWakeWord) return true;

  if (!third) return false;
  const mergedAlias = `${second}${third}`;
  return WAKE_WORD_ALIASES.some((alias) => levenshtein(mergedAlias, alias) <= 2);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[rows - 1][cols - 1];
}
