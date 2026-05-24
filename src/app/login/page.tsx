import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";

export default async function LoginPage() {
  const user = await getAuthenticatedAppUser();

  if (user) {
    redirect("/uebersicht");
  }

  return <LoginForm />;
}
