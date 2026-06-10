import { cookies } from "next/headers";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import {
  buildAuthenticatedAppUser,
  extractAppRole,
  getProfileDisplayName,
  type AuthenticatedAppUser,
  type UserProfileRecord,
} from "@/lib/auth";

type CookieMutation = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export function createServerComponentClient() {
  const cookieStore = cookies();

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieMutation[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot always persist refreshed cookies during render.
          }
        },
      },
    }
  );
}

export async function getAuthenticatedAppUser(): Promise<AuthenticatedAppUser | null> {
  const supabase = createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const authUser = buildAuthenticatedAppUser(user);
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, full_name, role, permissions")
    .eq("id", user.id)
    .maybeSingle<UserProfileRecord>();

  const displayName = getProfileDisplayName(profile);
  const profileRole = extractAppRole(profile?.role);

  return {
    ...authUser,
    fullName: displayName ?? authUser.fullName,
    role: profileRole ?? authUser.role,
    permissions: profile?.permissions ?? null,
  };
}
