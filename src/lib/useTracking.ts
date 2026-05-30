export function trackEvent(patientId: string, eventType: string, metadata?: Record<string, any>) {
  if (!patientId) return;
  fetch("/api/patient/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patient_id: patientId, event_type: eventType, metadata }),
  }).catch(() => {});
}
