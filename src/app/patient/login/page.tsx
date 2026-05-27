import { redirect } from "next/navigation";
import { getAuthenticatedPatient } from "@/lib/patient-auth";
import PatientLoginForm from "@/components/patient/PatientLoginForm";

export default async function PatientLoginPage() {
  const patient = await getAuthenticatedPatient();

  if (patient) {
    redirect("/patient/portal");
  }

  return <PatientLoginForm />;
}
