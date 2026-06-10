import { redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";
import ScribeLogin from "../ScribeLogin";

export const dynamic = "force-dynamic";

export default async function ScribeLoginPage() {
  const user = await getAuthenticatedAppUser();
  if (user) redirect("/scribe");
  return <ScribeLogin />;
}
