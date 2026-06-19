import { redirect } from "next/navigation";
import { getAuthenticatedAppUser, createServerComponentClient } from "@/lib/db/supabase-server";
import AnimusCockpit, { type AktiverPatient } from "./AnimusCockpit";

export const dynamic = "force-dynamic";

// ANIMUS-HUD-Route. Bettet das Sprach-HUD ein und haengt den Diktat-Doku-Flow
// an den bestehenden Speicherweg (POST /api/doku/eintrag) ueber den eingeloggten
// Account. Auth-Gating identisch zur Cockpit-Seite.
export default async function AnimusPage() {
  const user = await getAuthenticatedAppUser();
  if (!user) redirect("/scribe/login");

  // Aktive Patienten serverseitig laden, ueber den eingeloggten (RLS-)Client wie
  // /api/praxis/search und /api/doku/heute. "aktiv" = behandlung_status = 'aktiv'.
  const supabase = createServerComponentClient();
  const { data } = await supabase
    .from("patients")
    .select("id, vorname, nachname, geschlecht, geburtsdatum, behandlung, kasse, telefon, mobiltelefon, email, strasse, plz, ort")
    .eq("behandlung_status", "aktiv")
    .order("nachname")
    .order("vorname")
    .limit(2000);

  const patienten = (data ?? []) as AktiverPatient[];

  const tokenEndpoint = process.env.NEXT_PUBLIC_ANIMUS_TOKEN_ENDPOINT ?? "";

  return (
    <AnimusCockpit
      tokenEndpoint={tokenEndpoint}
      nutzerName={user.fullName ?? user.email ?? "Praxis"}
      patienten={patienten}
    />
  );
}
