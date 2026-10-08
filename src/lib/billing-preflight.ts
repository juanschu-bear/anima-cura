import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { extractAppRole } from "./auth";
import { canReadBilling, loadScribeReadiness, previousBillingQuarter, validBillingPeriod } from "./billing-readiness";
import { renderBillingReadiness } from "./billing-readiness-html";
import { t } from "./i18n";

/** Read-only handler, injectable for permission, failure and completeness tests. */
export function billingPreflightHandler(createClient: () => Pick<SupabaseClient, "auth" | "from">) {
  return async (request: Request) => {
    const url = new URL(request.url);
    const locale = url.searchParams.get("lang") === "en" ? "en" : "de";
    const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
    const fail = (key: string, status: number) => Response.json({ error: t(key, locale) }, { status, headers });
    try {
      const client = createClient();
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) return fail("billing.unauthorized", 401);
      const { data: profile, error: profileError } = await client.from("user_profiles")
        .select("role, permissions").eq("id", user.id).maybeSingle();
      if (profileError) return fail("billing.loadError", 503);
      // Only database profiles and signed app_metadata, never user_metadata.
      const role = extractAppRole(profile?.role) ?? extractAppRole(user.app_metadata?.role);
      if (!canReadBilling(role, profile?.permissions ?? null)) return fail("billing.forbidden", 403);

      const patientId = url.searchParams.get("patient_id");
      if (!z.string().uuid().safeParse(patientId).success) return fail("billing.invalidPatient", 400);
      const period = previousBillingQuarter();
      const from = url.searchParams.get("from") ?? period.from;
      const to = url.searchParams.get("to") ?? period.to;
      if (!validBillingPeriod(from, to)) return fail("billing.invalidPeriod", 400);
      const { data: patient, error: patientError } = await client.from("patients")
        .select("id, vorname, nachname").eq("id", patientId!).maybeSingle();
      if (patientError) return fail("billing.loadError", 503);
      if (!patient) return fail("billing.notFound", 404);

      const result = await loadScribeReadiness(patient.id, from, to, async (offset, limit) => {
        const { data, error } = await client.from("doku_eintraege")
          .select("id, patient_id, version, termin_datum, status, bestaetigt_am, positionen")
          .eq("patient_id", patient.id).eq("status", "bestaetigt")
          .gte("termin_datum", from).lte("termin_datum", to)
          .order("id", { ascending: true }).range(offset, offset + limit - 1);
        if (error || !data) throw new Error("source_read_failed");
        return data;
      });
      if (url.searchParams.get("format") === "json") return Response.json(result, { headers });
      return new Response(renderBillingReadiness({
        id: patient.id, name: [patient.vorname, patient.nachname].filter(Boolean).join(" "),
      }, result, locale), { headers: {
        ...headers, "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'",
        "X-Content-Type-Options": "nosniff",
      } });
    } catch {
      // Incomplete source reads are an error, never an empty reconciliation.
      return fail("billing.loadError", 503);
    }
  };
}
