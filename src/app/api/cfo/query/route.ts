import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createClient(url, serviceRoleKey);
}

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get("x-jordan-token");
  const expected = process.env.JORDAN_API_TOKEN;
  if (!expected) return true;
  return token === expected;
}

interface QueryAction {
  type: string;
  params?: Record<string, any>;
}

async function executeQuery(action: QueryAction) {
  const supabase = getSupabase();

  switch (action.type) {

    case "overview": {
      const { count: totalPatients } = await supabase.from("patients").select("*", { count: "exact", head: true });
      const { data: insuranceData } = await supabase.from("patients").select("versicherung_status");
      const insurance: Record<string, number> = {};
      insuranceData?.forEach((p: any) => {
        const key = p.versicherung_status || "Unbekannt";
        insurance[key] = (insurance[key] || 0) + 1;
      });
      const { count: withEmail } = await supabase.from("patients").select("*", { count: "exact", head: true }).neq("email", "");
      const { count: withMobile } = await supabase.from("patients").select("*", { count: "exact", head: true }).neq("mobiltelefon", "");
      const { count: ratenplaene } = await supabase.from("ratenplaene").select("*", { count: "exact", head: true });
      const { count: offeneRaten } = await supabase.from("ratenplaene").select("*", { count: "exact", head: true }).eq("status", "offen");

      return {
        total_patients: totalPatients || 0,
        insurance_distribution: insurance,
        patients_with_email: withEmail || 0,
        patients_with_mobile: withMobile || 0,
        total_rate_plans: ratenplaene || 0,
        open_rate_plans: offeneRaten || 0,
      };
    }

    case "overdue_rates": {
      const { data, count } = await supabase
        .from("ratenplaene")
        .select("*, patients(vorname, nachname, email, mobiltelefon)", { count: "exact" })
        .eq("status", "ueberfaellig")
        .order("faellig_am", { ascending: true })
        .limit(action.params?.limit || 20);

      return { count: count || 0, rates: data || [] };
    }

    case "chargebacks": {
      const { data, count } = await supabase
        .from("transaktionen")
        .select("*, patients:matched_patient_id(vorname, nachname)", { count: "exact" })
        .eq("matching_status", "ruecklastschrift")
        .order("datum", { ascending: false })
        .limit(action.params?.limit || 20);

      return { count: count || 0, chargebacks: data || [] };
    }

    case "dunning_status": {
      const { data } = await supabase
        .from("patients")
        .select("id, vorname, nachname, mahnstufe, scoring")
        .gt("mahnstufe", 0)
        .order("mahnstufe", { ascending: false });

      const stages: Record<string, number> = { karenz: 0, stufe1: 0, stufe2: 0, eskalation: 0 };
      data?.forEach((p: any) => {
        if (p.mahnstufe === 1) stages.karenz++;
        else if (p.mahnstufe === 2) stages.stufe1++;
        else if (p.mahnstufe === 3) stages.stufe2++;
        else if (p.mahnstufe >= 4) stages.eskalation++;
      });

      return { total_in_dunning: data?.length || 0, stages, patients: data || [] };
    }

    case "patient_search": {
      const name = action.params?.name;
      if (!name) return { error: "name parameter required" };

      const { data } = await supabase
        .from("patients")
        .select("id, vorname, nachname, geburtsdatum, email, mobiltelefon, versicherung_status, behandlung, kasse")
        .or(`vorname.ilike.%${name}%,nachname.ilike.%${name}%`)
        .limit(10);

      return { results: data || [] };
    }

    case "patient_detail": {
      const id = action.params?.id;
      if (!id) return { error: "id parameter required" };

      const { data: patient } = await supabase
        .from("patients")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      const { data: raten } = await supabase
        .from("ratenplaene")
        .select("*")
        .eq("patient_id", id)
        .order("created_at", { ascending: false });

      const { data: transaktionen } = await supabase
        .from("transaktionen")
        .select("*")
        .eq("matched_patient_id", id)
        .order("datum", { ascending: false })
        .limit(20);

      return { patient, rate_plans: raten || [], transactions: transaktionen || [] };
    }

    case "monthly_revenue": {
      const { data } = await supabase
        .from("transaktionen")
        .select("betrag, datum")
        .gte("datum", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
        .gt("betrag", 0);

      const total = data?.reduce((sum: number, t: any) => sum + (t.betrag || 0), 0) || 0;
      return { month: new Date().toISOString().slice(0, 7), total_revenue: total, transaction_count: data?.length || 0 };
    }

    case "workflows": {
      const { data } = await supabase
        .from("einstellungen")
        .select("value")
        .eq("key", "workflows")
        .maybeSingle();

      const workflows = data?.value || [];
      if (!Array.isArray(workflows)) return { total: 0, active: 0, workflows: [] };

      const summary = workflows.map((w: any) => {
        const triggerNode = w.nodes?.find((n: any) => n.type === "trigger");
        const actionNodes = w.nodes?.filter((n: any) => n.type?.startsWith("action_")) || [];
        const conditionNodes = w.nodes?.filter((n: any) => n.type === "condition") || [];

        const triggerType = triggerNode?.data?.event || "unknown";
        const triggerDays = triggerNode?.data?.days;

        return {
          name: w.name || "Unnamed workflow",
          description: w.description || "",
          active: w.active || false,
          trigger: triggerType + (triggerDays ? ` (${triggerDays} days)` : ""),
          node_count: w.nodes?.length || 0,
          actions: actionNodes.map((a: any) => a.type?.replace("action_", "")),
          conditions: conditionNodes.map((c: any) => c.data?.field || "unknown"),
          runs_today: w.runsToday || 0,
        };
      });

      return {
        total: workflows.length,
        active: workflows.filter((w: any) => w.active).length,
        workflows: summary,
      };
    }

    case "toggle_workflow": {
      const name = action.params?.name;
      const active = action.params?.active;
      if (!name) return { error: "name parameter required" };

      const { data } = await supabase
        .from("einstellungen")
        .select("value")
        .eq("key", "workflows")
        .maybeSingle();

      const workflows = data?.value || [];
      if (!Array.isArray(workflows)) return { error: "No workflows found" };

      const wf = workflows.find((w: any) => w.name?.toLowerCase().includes(name.toLowerCase()));
      if (!wf) return { error: `Workflow "${name}" not found` };

      wf.active = active !== undefined ? active : !wf.active;

      const { error } = await supabase
        .from("einstellungen")
        .update({ value: workflows })
        .eq("key", "workflows");

      if (error) return { error: error.message };
      return { success: true, workflow: wf.name, active: wf.active };
    }

    case "create_workflow": {
      const wfName = action.params?.name;
      const triggerEvent = action.params?.trigger || "rate_overdue";
      const triggerDays = action.params?.days || 6;
      const actions = action.params?.actions || ["email"];
      const description = action.params?.description || "";

      if (!wfName) return { error: "name parameter required" };

      const { data } = await supabase
        .from("einstellungen")
        .select("value")
        .eq("key", "workflows")
        .maybeSingle();

      const workflows = Array.isArray(data?.value) ? data.value : [];

      const nid = () => Math.random().toString(36).slice(2, 10);
      const nodes: any[] = [
        { id: nid(), type: "trigger", position: { x: 40, y: 220 }, data: { event: triggerEvent, days: triggerDays } },
      ];
      const edges: any[] = [];
      let lastId = nodes[0].id;
      let xPos = 380;

      if (actions.includes("email")) {
        const emailId = nid();
        nodes.push({ id: emailId, type: "action_email", position: { x: xPos, y: 160 }, data: {
          recipient: "patient",
          subject: `Erinnerung: Offene Rate`,
          body: `Sehr geehrte/r {{patient_name}},\n\nwir möchten Sie freundlich daran erinnern, dass eine Zahlung offen ist.\n\nMit freundlichen Grüßen\n{{praxis_name}}`,
        }});
        edges.push({ id: nid(), source: lastId, target: emailId, type: "smoothstep", animated: true });
        lastId = emailId;
        xPos += 360;
      }

      if (actions.includes("whatsapp")) {
        const waId = nid();
        nodes.push({ id: waId, type: "action_whatsapp", position: { x: xPos, y: 220 }, data: {
          message: `Hallo {{patient_name}}, wir möchten Sie an eine offene Zahlung erinnern. Bei Fragen erreichen Sie uns jederzeit.`,
        }});
        edges.push({ id: nid(), source: lastId, target: waId, type: "smoothstep", animated: true });
        lastId = waId;
        xPos += 360;
      }

      if (actions.includes("alert")) {
        const alertId = nid();
        nodes.push({ id: alertId, type: "action_alert", position: { x: xPos, y: 280 }, data: {
          severity: "warning", recipient: "praxisleitung", message: `Automatischer Alert: {{patient_name}}`,
        }});
        edges.push({ id: nid(), source: lastId, target: alertId, type: "smoothstep", animated: true });
        xPos += 360;
      }

      const newWorkflow = {
        id: nid(),
        name: wfName,
        description,
        active: false,
        updatedAt: new Date().toISOString(),
        runsToday: 0,
        errors: 0,
        nodes,
        edges,
      };

      workflows.push(newWorkflow);

      const { error } = await supabase
        .from("einstellungen")
        .update({ value: workflows })
        .eq("key", "workflows");

      if (error) return { error: error.message };
      return { success: true, workflow: wfName, nodes: nodes.length, status: "created but inactive — activate when ready" };
    }

    case "send_patient_email": {
      const patientId = action.params?.patient_id;
      const patientName = action.params?.patient_name;
      const subject = action.params?.subject || "Mitteilung von Ihrer Kieferorthopädischen Praxis";
      const body = action.params?.body;

      if (!body) return { error: "body parameter required" };

      let email = "";
      let fullName = "";
      if (patientId) {
        const { data } = await supabase.from("patients").select("email, vorname, nachname").eq("id", patientId).maybeSingle();
        email = data?.email || "";
        fullName = `${data?.vorname || ""} ${data?.nachname || ""}`.trim();
      } else if (patientName) {
        const parts = patientName.split(/[,\s]+/).filter(Boolean);
        if (parts.length >= 1) {
          const { data } = await supabase.from("patients").select("email, vorname, nachname").ilike("nachname", `%${parts[0]}%`).limit(1).maybeSingle();
          email = data?.email || "";
          fullName = `${data?.vorname || ""} ${data?.nachname || ""}`.trim();
        }
      }

      if (!email) return { error: "Patient email not found" };

      const { sendEmail } = await import("@/lib/services/email-send");
      const result = await sendEmail({
        to: email,
        subject,
        body: body.replace(/\\n/g, "<br>"),
        context: { patient_name: fullName },
      });

      if (!result.ok) return { error: result.error || "Email sending failed" };

      return { success: true, sent_to: email, patient: fullName, subject };
    }

    case "update_dunning_stage": {
      const patientId = action.params?.patient_id;
      const patientName = action.params?.patient_name;
      const stage = action.params?.stage;

      if (stage === undefined) return { error: "stage parameter required (0-4)" };

      let id = patientId;
      if (!id && patientName) {
        const parts = patientName.split(/[,\s]+/).filter(Boolean);
        if (parts.length >= 1) {
          const { data } = await supabase.from("patients").select("id").ilike("nachname", `%${parts[0]}%`).limit(1).maybeSingle();
          id = data?.id;
        }
      }

      if (!id) return { error: "Patient not found" };

      const { error } = await supabase
        .from("patients")
        .update({ mahnstufe: stage })
        .eq("id", id);

      if (error) return { error: error.message };
      const stageNames: Record<number, string> = { 0: "No dunning", 1: "Karenz", 2: "Stufe 1", 3: "Stufe 2", 4: "Eskalation" };
      return { success: true, patient_id: id, new_stage: stage, stage_name: stageNames[stage] || `Stage ${stage}` };
    }

    default:
      return { error: `Unknown query type: ${action.type}`, available: [
        "overview", "overdue_rates", "chargebacks", "dunning_status",
        "patient_search", "patient_detail", "monthly_revenue", "workflows",
        "toggle_workflow", "create_workflow", "send_patient_email", "update_dunning_stage"
      ]};
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, params } = body;

    if (!action) {
      return NextResponse.json({
        error: "Missing action",
        available: [
          "overview", "overdue_rates", "chargebacks", "dunning_status",
          "patient_search", "patient_detail", "monthly_revenue", "workflows"
        ]
      }, { status: 400 });
    }

    const result = await executeQuery({ type: action, params });
    return NextResponse.json({ ok: true, action, data: result });
  } catch (error: any) {
    console.error("[jordan/query] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
