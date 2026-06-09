import { AnamneseForm } from "@/components/patient/AnamneseForm";

export default function AnamneseTestPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
      <AnamneseForm patientId="test-patient" />
    </main>
  );
}
