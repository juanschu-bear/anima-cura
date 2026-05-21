import { createBrowserClient } from "@/lib/db/supabase";
import type { Workflow, WorkflowRun, WorkflowVersion, WorkflowPatientState } from "./types";

export const WORKFLOWS_KEY = "workflows";

export async function readWorkflows(): Promise<Workflow[] | null> {
  try {
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("einstellungen")
      .select("value")
      .eq("key", WORKFLOWS_KEY)
      .maybeSingle();
    if (error) {
      console.error("[workflows] read failed", error);
      return null;
    }
    if (data?.value && Array.isArray(data.value)) return data.value as Workflow[];
    return null;
  } catch (err) {
    console.error("[workflows] read threw", err);
    return null;
  }
}

export async function writeWorkflows(next: Workflow[]): Promise<string | null> {
  try {
    const supabase = createBrowserClient();
    const { error } = await supabase
      .from("einstellungen")
      .upsert({ key: WORKFLOWS_KEY, value: next }, { onConflict: "key" });
    if (error) {
      console.error("[workflows] write failed", error);
      return error.message;
    }
    return null;
  } catch (err: any) {
    console.error("[workflows] write threw", err);
    return err?.message || "Speichern fehlgeschlagen";
  }
}

export async function readRuns(workflowId: string, limit = 50): Promise<WorkflowRun[]> {
  try {
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("workflow_runs")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[runs] read failed", error);
      return [];
    }
    return (data as WorkflowRun[]) || [];
  } catch (err) {
    console.error("[runs] read threw", err);
    return [];
  }
}

export async function insertRun(run: Omit<WorkflowRun, "id">): Promise<WorkflowRun | null> {
  try {
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("workflow_runs")
      .insert(run)
      .select()
      .single();
    if (error) {
      console.error("[runs] insert failed", error);
      return null;
    }
    return data as WorkflowRun;
  } catch (err) {
    console.error("[runs] insert threw", err);
    return null;
  }
}

export async function readPatientStates(workflowId: string): Promise<WorkflowPatientState[]> {
  try {
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("workflow_patient_states")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("[patient_states] read failed", error);
      return [];
    }
    return (data as WorkflowPatientState[]) || [];
  } catch (err) {
    console.error("[patient_states] read threw", err);
    return [];
  }
}

export async function readVersions(workflowId: string): Promise<WorkflowVersion[]> {
  try {
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("workflow_versions")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("version", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[versions] read failed", error);
      return [];
    }
    return (data as WorkflowVersion[]) || [];
  } catch (err) {
    console.error("[versions] read threw", err);
    return [];
  }
}

export async function pushVersion(workflowId: string, snapshot: Workflow, note?: string): Promise<void> {
  try {
    const supabase = createBrowserClient();
    const { data: latest } = await supabase
      .from("workflow_versions")
      .select("version")
      .eq("workflow_id", workflowId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = (latest?.version ?? 0) + 1;
    const { error } = await supabase.from("workflow_versions").insert({
      workflow_id: workflowId,
      version: next,
      snapshot,
      note: note ?? null,
    });
    if (error) console.error("[versions] push failed", error);
  } catch (err) {
    console.error("[versions] push threw", err);
  }
}
