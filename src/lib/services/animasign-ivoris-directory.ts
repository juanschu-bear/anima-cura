export type DirectoryStrategyResult = {
  label: string;
  ids: string[];
  complete?: boolean;
};

export type DirectoryDecision =
  | { kind: "reuse"; id: string; summary: string[] }
  | { kind: "create"; summary: string[] }
  | { kind: "manual_review"; summary: string[] };

/**
 * Evaluates ordered Ivoris directory search strategies for duplicate prevention.
 *
 * Rules:
 * All positive strategies must agree. Incomplete searches are never absence evidence.
 */
export function decideIvorisDirectoryAction(
  results: DirectoryStrategyResult[]
): DirectoryDecision {
  const summary = results.map((result) => `${result.label}=${result.ids.length}`);
  if (!results.length || results.some(result => result.complete === false)) return { kind: 'manual_review', summary };
  const positive = results.map(result => Array.from(new Set(result.ids))).filter(ids => ids.length);
  if (!positive.length) return { kind: 'create', summary };
  const agreed = positive[0].filter(id => positive.every(ids => ids.includes(id)));
  return agreed.length === 1 ? { kind: 'reuse', id: agreed[0], summary } : { kind: 'manual_review', summary };
}
