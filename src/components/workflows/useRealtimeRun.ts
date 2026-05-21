"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/db/supabase";
import type { WorkflowRun, RunStatus } from "./types";

/**
 * Subscribes to workflow_runs for the given workflow and yields a map
 * of node_id → current step status for the most recent in-flight run.
 *
 * Soft-fails when Supabase is unreachable or realtime isn't configured.
 */
export function useRealtimeRun(workflowId: string | null) {
  const [statuses, setStatuses] = useState<Record<string, RunStatus>>({});
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null);

  useEffect(() => {
    if (!workflowId) return;
    let cancelled = false;
    let channel: any = null;

    function applyRun(run: WorkflowRun) {
      if (cancelled) return;
      setActiveRun(run);
      const map: Record<string, RunStatus> = {};
      (run.steps || []).forEach((s) => {
        map[s.node_id] = s.status;
      });
      setStatuses(map);
    }

    try {
      const supabase = createBrowserClient();

      // Initial fetch of latest run
      (async () => {
        const { data } = await supabase
          .from("workflow_runs")
          .select("*")
          .eq("workflow_id", workflowId)
          .order("started_at", { ascending: false })
          .limit(1);
        if (data && data[0]) applyRun(data[0] as WorkflowRun);
      })();

      // Subscribe
      channel = supabase
        .channel(`runs-${workflowId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "workflow_runs", filter: `workflow_id=eq.${workflowId}` },
          (payload: any) => {
            if (payload.new) applyRun(payload.new as WorkflowRun);
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("[realtime] not available", err);
    }

    return () => {
      cancelled = true;
      try {
        if (channel) channel.unsubscribe();
      } catch {
        // ignore
      }
    };
  }, [workflowId]);

  return { statuses, activeRun };
}
