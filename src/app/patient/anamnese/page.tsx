import { AnamneseForm } from "@/components/patient/AnamneseForm";

export default function AnamneseTestPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const modus = searchParams?.modus === "praxis" ? "praxis" : "patient";
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
      <AnamneseForm patientId="test-patient" modus={modus} />
    </main>
  );
}
