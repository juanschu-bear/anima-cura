import { redirect } from "next/navigation";
import { getAuthenticatedPatient } from "@/lib/patient-auth";
import PatientPortalShell from "@/components/patient/PatientPortalShell";
import PatientAccessAssistant from "@/components/patient/PatientAccessAssistant";
import { buildPatientPortalTarget } from "@/lib/patient-navigation";

export default async function PatientPortalPage({ searchParams }: { searchParams?: { document?: string; section?: string } }) {
  const patient = await getAuthenticatedPatient();

  if (!patient) {
    redirect(`/patient/login?next=${encodeURIComponent(buildPatientPortalTarget(searchParams))}`);
  }

  return (
    <><PatientPortalShell
      patientId={patient.patientId}
      patientName={patient.name}
      patientEmail={patient.email}
    /><PatientAccessAssistant /></>
  );
}
