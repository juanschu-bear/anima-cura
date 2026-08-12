import { createServerClient } from "@/lib/db/supabase";
import WelcomeScreen from "./WelcomeScreen";

export default async function WelcomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === "test-preview") {
    return <WelcomeScreen vorname="Juan" loginEmail="juan.schubert@animacura.de" password="Tf9#xKp4Ln" />;
  }

  const supabase = createServerClient();
  const { data: sub } = await supabase
    .from("anamnese_submissions")
    .select("vorname, email, account_email, account_password, answers")
    .eq("id", id)
    .maybeSingle();

  if (!sub) {
    return (
      <WelcomeScreen
        vorname=""
        loginEmail=""
        password=""
        fallbackMode="missing_submission"
      />
    );
  }

  const lang = (sub.answers as Record<string, string>)?.sprache || "de";

  return <WelcomeScreen
    vorname={sub.vorname || ""}
    loginEmail={sub.account_email || ""}
    password={sub.account_password || ""}
    contactEmail={sub.email || ""}
    accountReady={Boolean(sub.account_email)}
    fallbackMode={sub.account_email ? "none" : "account_pending"}
    lang={lang as "de"|"en"|"es"|"ru"|"tr"}
  />;
}
