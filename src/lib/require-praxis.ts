import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";

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
