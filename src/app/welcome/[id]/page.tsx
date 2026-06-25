import { createServerClient } from "@/lib/db/supabase";
import { notFound } from "next/navigation";
import WelcomeScreen from "./WelcomeScreen";

export default async function WelcomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === "test-preview") {
    return <WelcomeScreen vorname="Juan" loginEmail="juan.schubert@animacura.de" password="Tf9#xKp4Ln" />;
  }

  const supabase = createServerClient();
  const { data: sub } = await supabase
    .from("anamnese_submissions")
    .select("vorname, account_email, account_password, answers")
    .eq("id", id)
    .single();

  if (!sub || !sub.account_email) return notFound();

  const lang = (sub.answers as Record<string, string>)?.sprache || "de";

  return <WelcomeScreen
    vorname={sub.vorname || ""}
    loginEmail={sub.account_email}
    password={sub.account_password || ""}
    lang={lang as "de"|"en"|"es"|"ru"|"tr"}
  />;
}
