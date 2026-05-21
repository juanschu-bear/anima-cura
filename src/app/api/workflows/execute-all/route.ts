import { NextRequest, NextResponse } from "next/server";
import { executeStoredWorkflow, loadStoredWorkflows, resolveBatchContexts } from "@/app/api/workflows/execute/route";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workflows = await loadStoredWorkflows();
    const activeWorkflows = workflows.filter((workflow) => workflow.active);
    const results: Array<Record<string, unknown>> = [];
    let executedRuns = 0;
    let skipped = 0;

    for (const workflow of activeWorkflows) {
      const contexts = await resolveBatchContexts(workflow);

      if (contexts.length === 0) {
        skipped += 1;
        results.push({
          workflowId: workflow.id,
          status: "skipped",
          reason: "Kein passender Trigger-Kontext gefunden.",
        });
        continue;
      }

      for (const context of contexts) {
        const result = await executeStoredWorkflow(workflow, context);
        results.push(result as Record<string, unknown>);
        if ((result as { status?: string }).status === "success") {
          executedRuns += 1;
        } else if ((result as { status?: string }).status === "skipped") {
          skipped += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      totalWorkflows: activeWorkflows.length,
      executedRuns,
      skipped,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler in execute-all.";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
