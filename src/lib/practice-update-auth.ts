import { extractAppRole, type AppRole } from "@/lib/auth";
import { createServerClient } from "@/lib/db/supabase";
import { createServerComponentClient } from "@/lib/db/supabase-server";

export type PracticeUpdateActor = { id: string; role: AppRole };

export async function getPracticeUpdateActor(): Promise<PracticeUpdateActor | null> {
  const auth = createServerComponentClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await createServerClient()
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error("practice_profile_unavailable");

  const role = extractAppRole(profile?.role);
  return role ? { id: user.id, role } : null;
}
