import { redirect } from "next/navigation";
import { getAuthenticatedPatient } from "@/lib/patient-auth";
import PatientLoginForm from "@/components/patient/PatientLoginForm";
import PatientAccessAssistant from "@/components/patient/PatientAccessAssistant";
import { safePatientTarget } from "@/lib/patient-navigation";

export default async function PatientLoginPage({ searchParams }: { searchParams?: { next?: string } }) {
  const patient = await getAuthenticatedPatient();

  if (patient) {
    redirect(safePatientTarget(searchParams?.next));
  }

  return <><PatientLoginForm /><PatientAccessAssistant /></>;
}
