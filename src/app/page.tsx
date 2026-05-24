import { redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";

export default async function Home() {
  const user = await getAuthenticatedAppUser();
  redirect(user ? "/uebersicht" : "/login");
}
