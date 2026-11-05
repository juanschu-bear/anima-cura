import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DayRecordError } from "@/lib/scribe-day-record-service";
import { normalizeStaffInitials } from "@/lib/scribe-identity";

export async function requireScribeDayWriter(db: SupabaseClient) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new DayRecordError("not_authenticated", 401, "Nicht autorisiert.");
  const { data: profile, error } = await db.from("user_profiles")
    .select("role,kuerzel,permissions")
    .eq("id", user.id)
    .single();
  if (error || !profile) throw new DayRecordError("profile_unavailable", 503, "Mitarbeiterprofil ist nicht verfügbar.");
  const role = typeof profile.role === "string" ? profile.role : null;
  const permissions = (profile.permissions ?? {}) as { scribe_schreiben?: boolean };
  const allowed = permissions.scribe_schreiben ?? (!!role && ["admin", "verwaltung"].includes(role));
  if (!allowed) throw new DayRecordError("scribe_forbidden", 403, "Keine Berechtigung.");
  const initials = normalizeStaffInitials(profile.kuerzel);
  if (!initials) throw new DayRecordError("staff_initials_missing", 409, "Im Mitarbeiterprofil fehlt das Kürzel.");
  return { user, profile, initials };
}

export function dayRouteError(error: unknown) {
  if (error instanceof DayRecordError) {
    return NextResponse.json({ error: error.code, message: error.message, ...(error.details ?? {}) }, { status: error.status });
  }
  return NextResponse.json({ error: "day_record_failed", message: "Der Tagesdatensatz konnte nicht verarbeitet werden." }, { status: 500 });
}
