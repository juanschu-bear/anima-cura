'use client';
import { useAppStore } from '@/hooks/useAppStore';
import TreatmentAccount from '@/components/billing/TreatmentAccount';
export default function Page({ params }: { params: { id: string } }) {
  const { locale, theme } = useAppStore();
  return <TreatmentAccount patientId={params.id} locale={locale} theme={theme} />;
}
