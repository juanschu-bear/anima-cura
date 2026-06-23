import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  // Use service role key for DDL operations
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { 
      auth: { persistSession: false },
      db: { schema: "public" },
    }
  );

  // First, create the exec_sql helper function if it doesn't exist
  const createFnSQL = `
    CREATE OR REPLACE FUNCTION exec_sql(query text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE query;
    END;
    $$;
  `;

  // Use the postgrest RPC endpoint to run raw SQL
  // Since we can't run DDL directly, we need the management API
  // Let's try using the supabase management API instead
  
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1];
  
  // Alternative: use the pg_net extension or create function via REST
  // Actually, let's just try creating function via fetch to the SQL endpoint
  const mgmtRes = await fetch(
    `https://${projectRef}.supabase.co/rest/v1/rpc/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    }
  );

  // Simplest approach: just tell Juan to run the SQL manually in the Supabase dashboard
  // and provide the exact SQL
  
  const sql = `
-- Run this in Supabase SQL Editor (Dashboard > SQL):
ALTER TABLE anamnese_submissions
  ADD COLUMN IF NOT EXISTS account_email text,
  ADD COLUMN IF NOT EXISTS is_existing boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_patient_id uuid REFERENCES patients(id),
  ADD COLUMN IF NOT EXISTS ivoris_synced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ivoris_sync_error text,
  ADD COLUMN IF NOT EXISTS ivoris_doc_synced boolean DEFAULT false;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_anamnese_ivoris_synced ON anamnese_submissions(ivoris_synced) WHERE NOT ivoris_synced;
CREATE INDEX IF NOT EXISTS idx_anamnese_account ON anamnese_submissions(account_email) WHERE account_email IS NOT NULL;
  `.trim();

  // But let's also try running it through the Supabase SQL API
  try {
    const sqlRes = await fetch(
      `https://${projectRef}.supabase.co/pg/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );
    
    if (sqlRes.ok) {
      const result = await sqlRes.json();
      return NextResponse.json({ status: "migrated", result });
    }
    
    // If that fails, try the management API endpoint
    const sql2Res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST", 
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (sql2Res.ok) {
      const result2 = await sql2Res.json();
      return NextResponse.json({ status: "migrated_v2", result: result2 });
    }

    return NextResponse.json({ 
      status: "manual_required",
      message: "Bitte dieses SQL im Supabase Dashboard ausfuehren (SQL Editor):",
      sql,
      attempts: {
        pg_query: sqlRes.status,
        mgmt_api: sql2Res.status,
      }
    });
  } catch (err) {
    return NextResponse.json({ 
      status: "manual_required",
      message: "Bitte dieses SQL im Supabase Dashboard ausfuehren (SQL Editor):",
      sql,
      error: String(err),
    });
  }
}
