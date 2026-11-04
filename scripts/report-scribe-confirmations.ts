import { createServerClient } from "../src/lib/db/supabase";

type Row = { outcome: "rejected" | "confirmed"; template_key: string; issues: Array<{code:string;module:string|null;group:string|null}> };

async function main() {
  const start = process.argv[2] ?? new Date().toISOString().slice(0, 10) + "T00:00:00+01:00";
  const end = process.argv[3] ?? new Date().toISOString();
  const db = createServerClient();
  const { data, error } = await db.from("scribe_confirmation_attempts")
    .select("occurred_at,outcome,template_key,issues")
    .gte("occurred_at", start)
    .lte("occurred_at", end)
    .order("occurred_at", { ascending: true });
  if (error) throw new Error(`Monitoring-Auswertung fehlgeschlagen (${error.code ?? "unbekannt"})`);

  const templates = new Map<string, { rejected: number; confirmed: number }>();
  const issues = new Map<string, { template: string; code: string; module: string | null; group: string | null; rejected: number }>();
  for (const row of (data ?? []) as Row[]) {
    const totals = templates.get(row.template_key) ?? { rejected: 0, confirmed: 0 };
    totals[row.outcome] += 1;
    templates.set(row.template_key, totals);
    if (row.outcome === "rejected") for (const issue of row.issues) {
      const key = JSON.stringify([row.template_key, issue.code, issue.module, issue.group]);
      const aggregate = issues.get(key) ?? { template: row.template_key, ...issue, rejected: 0 };
      aggregate.rejected += 1;
      issues.set(key, aggregate);
    }
  }

  console.log(JSON.stringify({
    from: start,
    to: end,
    totals: Array.from(templates, ([template, counts]) => ({ template, ...counts })),
    issues: Array.from(issues.values()).sort((a, b) => b.rejected - a.rejected || a.template.localeCompare(b.template)),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Monitoring-Auswertung fehlgeschlagen");
  process.exitCode = 1;
});

