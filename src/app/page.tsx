import { redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";
import { getDefaultDashboardPath } from "@/lib/auth";

export default async function Home() {
  const user = await getAuthenticatedAppUser();
  redirect(user ? getDefaultDashboardPath(user.role) : "/login");
}
