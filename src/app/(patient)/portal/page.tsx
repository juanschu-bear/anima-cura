import { redirect } from "next/navigation";
import { getAuthenticatedPatient } from "@/lib/patient-auth";
import PatientPortalShell from "@/components/patient/PatientPortalShell";

export default async function PatientPortalPage() {
  const patient = await getAuthenticatedPatient();

  if (!patient) {
    redirect("/patient/login");
  }

  return (
    <PatientPortalShell
      patientId={patient.patientId}
      patientName={patient.name}
      patientEmail={patient.email}
    />
  );
}
