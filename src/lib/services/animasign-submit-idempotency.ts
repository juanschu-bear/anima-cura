import { createHash } from "node:crypto";

type Answers = Record<string, unknown>;

const IGNORED_ANSWER_KEYS = new Set([
  "unterschrift_versicherter",
  "unterschrift_vp2",
]);

function normalizeString(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return normalizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !IGNORED_ANSWER_KEYS.has(key))
      .map(([key, entry]) => [key, normalizeValue(entry)] as const)
      .sort(([left], [right]) => left.localeCompare(right));

    return Object.fromEntries(entries);
  }

  return value ?? null;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

export function buildSubmissionReplayFingerprint(input: {
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  email: string | null;
  answers: Answers;
}) {
  const identity = {
    vorname: input.vorname ?? "",
    nachname: input.nachname ?? "",
    geburtsdatum: input.geburtsdatum ?? "",
    email: input.email ?? "",
  };

  return createHash("sha256")
    .update(stableStringify(identity))
    .update("|")
    .update(stableStringify(input.answers))
    .digest("hex");
}
