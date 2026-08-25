import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { repairPatientPortalAccess } from "@/lib/services/patient-portal-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = createServerComponentClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const result = await repairPatientPortalAccess(user);

  if (result.status === "already_ok" || result.status === "repaired") {
    return NextResponse.json({ ok: true, patientId: result.patientId, status: result.status, reason: "reason" in result ? result.reason : null });
  }

  if (result.status === "not_patient") {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 403 });
  }

  return NextResponse.json({ ok: false, error: result.reason }, { status: 409 });
}
