import { redirect } from "next/navigation";
import { getAuthenticatedPatient } from "@/lib/patient-auth";
import PatientPortalShell from "@/components/patient/PatientPortalShell";
import PatientAccessAssistant from "@/components/patient/PatientAccessAssistant";

function portalTarget(searchParams?: { document?: string; section?: string }) {
  const params = new URLSearchParams();
  if (searchParams?.document && /^[0-9a-f-]{36}$/i.test(searchParams.document)) params.set("document", searchParams.document);
  if (["documents", "invoices"].includes(searchParams?.section || "")) params.set("section", searchParams!.section!);
  const query = params.toString();
  return `/patient/portal${query ? `?${query}` : ""}`;
}

export default async function PatientPortalPage({ searchParams }: { searchParams?: { document?: string; section?: string } }) {
  const patient = await getAuthenticatedPatient();

  if (!patient) {
    redirect(`/patient/login?next=${encodeURIComponent(portalTarget(searchParams))}`);
  }

  return (
    <><PatientPortalShell
      patientId={patient.patientId}
      patientName={patient.name}
      patientEmail={patient.email}
    /><PatientAccessAssistant /></>
  );
}
