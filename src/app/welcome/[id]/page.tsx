import { createServerClient } from "@/lib/db/supabase";
import WelcomeScreen from "./WelcomeScreen";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function WelcomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === "test-preview") {
    return <WelcomeScreen vorname="Juan" loginEmail="juan.schubert@animacura.de" password="Tf9#xKp4Ln" />;
  }

  const supabase = createServerClient();
  const { data: sub } = await supabase
    .from("anamnese_submissions")
    .select("vorname, nachname, email, patient_id, matched_patient_id, account_email, account_password, answers")
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

  let loginEmail = sub.account_email || "";
  let password = sub.account_password || "";

  // Opening a link (including an email scanner) must never create an account
  // or reset credentials. Only show the already linked account.
  const patientId = sub.matched_patient_id || sub.patient_id;
  const { data: profile } = patientId ? await supabase.from("user_profiles")
    .select("id,email").eq("patient_id", patientId).eq("role", "patient").maybeSingle() : { data: null };
  if (!profile?.id || !profile.email || profile.email.toLowerCase() !== loginEmail.toLowerCase()) {
    loginEmail = "";
    password = "";
  } else {
    const { data, error } = await supabase.auth.admin.getUserById(profile.id);
    if (error || !data.user || data.user.user_metadata?.patient_id !== patientId ||
        (data.user.banned_until && Date.parse(data.user.banned_until) > Date.now())) {
      loginEmail = "";
      password = "";
    } else if (data.user.last_sign_in_at) {
      // A stored initial password is not evidence of the current password.
      password = "";
    }
  }

  const lang = (sub.answers as Record<string, string>)?.sprache || "de";

  return <WelcomeScreen
    vorname={sub.vorname || ""}
    loginEmail={loginEmail}
    password={password}
    contactEmail={sub.email || ""}
    accountReady={Boolean(loginEmail)}
    fallbackMode={loginEmail ? "none" : "account_pending"}
    lang={lang as "de"|"en"|"es"|"ru"|"tr"}
  />;
}
