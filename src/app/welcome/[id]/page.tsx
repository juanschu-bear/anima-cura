import { createServerClient } from "@/lib/db/supabase";
import { ensurePatientPortalAccount } from "@/lib/services/patient-portal-account";
import WelcomeScreen from "./WelcomeScreen";

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

  if (!loginEmail) {
    const ensured = await ensurePatientPortalAccount({
      vorname: sub.vorname || null,
      nachname: sub.nachname || null,
      patientEmail: sub.email || null,
      patientId: sub.matched_patient_id || sub.patient_id || null,
    });

    if (ensured.status === "created" || ensured.status === "existing") {
      loginEmail = ensured.login_email;
      if (ensured.status === "created") {
        password = ensured.password;
      }

      await supabase
        .from("anamnese_submissions")
        .update({
          account_email: loginEmail,
          ...(password ? { account_password: password } : {}),
        })
        .eq("id", id);
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
