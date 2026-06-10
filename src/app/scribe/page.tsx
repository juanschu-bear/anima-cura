import { redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";
import ScribeCockpit from "./ScribeCockpit";

export const dynamic = "force-dynamic";

export default async function ScribePage() {
  const user = await getAuthenticatedAppUser();
  if (!user) redirect("/scribe/login");
  return <ScribeCockpit nutzerName={user.fullName ?? user.email ?? "Praxis"} rolle={user.role} />;
}
