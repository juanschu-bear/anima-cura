import { createServerComponentClient } from "@/lib/db/supabase-server";
import { billingPreflightHandler } from "@/lib/billing-preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep the patient-profile URL working. The tested read-only handler replaces
// inferred packages with source-backed preflight findings; it issues no invoice.
export const GET = billingPreflightHandler(createServerComponentClient);
