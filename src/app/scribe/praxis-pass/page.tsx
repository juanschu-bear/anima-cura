import { redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";
import PraxisPass from "./PraxisPass";

export const dynamic = "force-dynamic";

export default async function PraxisPassPage() {
  const user = await getAuthenticatedAppUser();
  if (!user) redirect("/scribe/login");
  return <PraxisPass nutzerName={user.fullName ?? user.email ?? "Praxis"} />;
}
