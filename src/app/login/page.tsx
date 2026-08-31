import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";
import { getDefaultDashboardPath } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getAuthenticatedAppUser();

  if (user) {
    redirect(getDefaultDashboardPath(user.role));
  }

  return <LoginForm />;
}
