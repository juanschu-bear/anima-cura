import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const supabase = createServerClient();

  const columns = [
    { name: "account_email", type: "text" },
    { name: "is_existing", type: "boolean DEFAULT false" },
    { name: "matched_patient_id", type: "uuid" },
    { name: "ivoris_synced", type: "boolean DEFAULT false" },
    { name: "ivoris_sync_error", type: "text" },
    { name: "ivoris_doc_synced", type: "boolean DEFAULT false" },
  ];

  const results: Array<{ column: string; status: string }> = [];

  for (const col of columns) {
    const { error } = await supabase.rpc("exec_sql", {
      query: `ALTER TABLE anamnese_submissions ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`,
    });

    if (error) {
      // Try direct SQL via postgrest
      const { error: err2 } = await supabase
        .from("anamnese_submissions")
        .select(col.name)
        .limit(0);

      if (err2) {
        results.push({ column: col.name, status: `needs_manual: ${error.message}` });
      } else {
        results.push({ column: col.name, status: "already_exists" });
      }
    } else {
      results.push({ column: col.name, status: "created" });
    }
  }

  // Test: try selecting all new columns
  const { data: test, error: testErr } = await supabase
    .from("anamnese_submissions")
    .select("id, account_email, is_existing, matched_patient_id, ivoris_synced, ivoris_sync_error, ivoris_doc_synced")
    .limit(1);

  return NextResponse.json({
    migration: results,
    test: testErr ? { error: testErr.message } : { ok: true, sample: test },
  });
}
