import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

let browserClient: ReturnType<typeof createSupabaseBrowserClient> | null = null;

// Server-side client (mit Service Role Key für Cron-Jobs und API-Routes)
export function createServerClient(options: { noStore?: boolean } = {}) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false }, ...(options.noStore ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) } } : {}) }
  );
}

// Browser-side client (mit Anon Key)
export function createBrowserClient() {
  if (!browserClient) {
    browserClient = createSupabaseBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}

export const createAdminClient = createServerClient;
