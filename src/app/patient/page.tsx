import { redirect } from "next/navigation";

// /patient ohne Zusatz war eine 404-Sackgasse. Wer hier landet,
// gehoert zum Login (eingeloggte Patienten leitet die Middleware
// vom Portal aus ohnehin korrekt weiter).
export default function PatientIndexPage() {
  redirect("/patient/login");
}
