import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const supabase = createServerClient();

  // Read the function definition from Supabase
  const { data, error } = await supabase.rpc("abgleich_patient_aus_submission", {
    p_submission_id: "00000000-0000-0000-0000-000000000000"
  });

  // Also try to get the function source via pg_catalog
  const { data: fnSrc, error: fnErr } = await supabase
    .from("pg_catalog.pg_proc" as string)
    .select("prosrc")
    .eq("proname", "abgleich_patient_aus_submission")
    .maybeSingle();

  return NextResponse.json({
    testResult: { data, error: error?.message },
    functionSource: fnSrc || fnErr?.message || "Could not read function source",
  });
}
