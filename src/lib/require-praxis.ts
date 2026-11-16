import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";

/** Wie requirePraxisRole, gibt aber zusätzlich zurück, wer angemeldet ist (z. B. um festzuhalten, wer etwas bestätigt hat). */
export async function requirePraxisUser(
  rollen: string[] = ["admin", "verwaltung"]
): Promise<{ error: NextResponse } | { userId: string }> {
  const supabase = createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 }) };
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single();
  if (!rollen.includes(profile?.role as string)) return { error: NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 }) };
  return { userId: user.id };
}

export async function requirePraxisRole(
  rollen: string[] = ["admin", "verwaltung"]
): Promise<NextResponse | null> {
  const supabase = createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!rollen.includes(profile?.role as string)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  return null;
}
