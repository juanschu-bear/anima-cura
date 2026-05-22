import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
      const active = Array.isArray(workflows) ? workflows.filter((w: any) => w.active).length : 0;
      return { total: Array.isArray(workflows) ? workflows.length : 0, active };
    }

    default:
      return { error: `Unknown query type: ${action.type}`, available: [
        "overview", "overdue_rates", "chargebacks", "dunning_status",
        "patient_search", "patient_detail", "monthly_revenue", "workflows"
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
