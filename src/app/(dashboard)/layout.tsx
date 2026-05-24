import { redirect } from "next/navigation";
import DashboardShell from "@/components/auth/DashboardShell";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedAppUser();

  if (!user) {
    redirect("/login");
  }

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
