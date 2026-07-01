export type DirectoryStrategyResult = {
  label: string;
  ids: string[];
};

export type DirectoryDecision =
  | { kind: "reuse"; id: string; summary: string[] }
  | { kind: "create"; summary: string[] }
  | { kind: "manual_review"; summary: string[] };

/**
 * Evaluates ordered Ivoris directory search strategies for duplicate prevention.
 *
 * Rules:
 * - The first strategy with exactly one valid match can be reused immediately.
 * - If no strategy is unique but at least one strategy is ambiguous (>1), stop and require manual review.
 * - If every strategy has zero hits, it is safe to create a new patient.
 */
export function decideIvorisDirectoryAction(
  results: DirectoryStrategyResult[]
): DirectoryDecision {
  const summary = results.map((result) => `${result.label}=${result.ids.length}`);
  let sawAmbiguous = false;

  for (const result of results) {
    if (result.ids.length === 1) {
      return {
        kind: "reuse",
        id: result.ids[0],
        summary,
      };
    }

    if (result.ids.length > 1) {
      sawAmbiguous = true;
    }
  }

  if (sawAmbiguous) {
    return {
      kind: "manual_review",
      summary,
    };
  }

  return {
    kind: "create",
    summary,
  };
}
