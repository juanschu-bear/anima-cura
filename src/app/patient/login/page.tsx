import { redirect } from "next/navigation";
import { getAuthenticatedPatient } from "@/lib/patient-auth";
import PatientLoginForm from "@/components/patient/PatientLoginForm";

function safePatientTarget(value: string | undefined) {
  if (!value || !value.startsWith("/patient/portal") || value.startsWith("//")) return "/patient/portal";
  return value;
}

export default async function PatientLoginPage({ searchParams }: { searchParams?: { next?: string } }) {
  const patient = await getAuthenticatedPatient();

  if (patient) {
    redirect(safePatientTarget(searchParams?.next));
  }

  return <PatientLoginForm />;
}
