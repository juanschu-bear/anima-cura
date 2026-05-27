export type Lang = "de" | "en" | "es";

const dict: Record<string, Record<Lang, string>> = {
  // Header & Navigation
  "nav.start": { de: "Start", en: "Home", es: "Inicio" },
  "nav.journey": { de: "Verlauf", en: "Journey", es: "Progreso" },
  "nav.progress": { de: "Fortschritt", en: "Progress", es: "Avance" },
  "nav.chat": { de: "Chat", en: "Chat", es: "Chat" },
  "nav.more": { de: "Mehr", en: "More", es: "Más" },

  // Greeting
  "home.welcome": { de: "Willkommen zurück", en: "Welcome back", es: "Bienvenido/a de vuelta" },
  "home.hello": { de: "Hallo,", en: "Hello,", es: "Hola," },
  "home.currentPhase": { de: "Aktuelle Phase", en: "Current phase", es: "Fase actual" },
  "home.noPhase": { de: "Keine Phase", en: "No phase", es: "Sin fase" },
  "home.phase": { de: "Phase", en: "Phase", es: "Fase" },
  "home.invested": { de: "Investiert", en: "Invested", es: "Invertido" },
  "home.nextRate": { de: "Nächste Rate", en: "Next payment", es: "Próximo pago" },
  "home.rates": { de: "Raten", en: "Payments", es: "Cuotas" },
  "home.achievements": { de: "Erfolge", en: "Achievements", es: "Logros" },
  "home.message": { de: "Nachricht", en: "Message", es: "Mensaje" },
  "home.toPractice": { de: "an die Praxis", en: "to practice", es: "a la clínica" },
  "home.documents": { de: "Dokumente", en: "Documents", es: "Documentos" },
  "home.contractsPlans": { de: "Verträge & Pläne", en: "Contracts & plans", es: "Contratos y planes" },
  "home.phaseTip": { de: "Tipp für deine Phase", en: "Tip for your phase", es: "Consejo para tu fase" },
  "home.today": { de: "Heute", en: "Today", es: "Hoy" },

  // Hint banner
  "hint.title": { de: "Hinweis:", en: "Notice:", es: "Aviso:" },
  "hint.text": { de: "Es gibt eine kleine Verzögerung bei Ihrer letzten Rate. Bitte prüfen Sie dies kurz im Fortschritt-Reiter, damit Ihr Verlauf reibungslos weitergeht.", en: "There is a small delay with your last payment. Please check the Progress tab to keep your journey on track.", es: "Hay un pequeño retraso con su último pago. Por favor revise la pestaña de Avance para mantener su progreso al día." },

  // Journey
  "journey.title": { de: "Verlauf", en: "Journey", es: "Progreso" },
  "journey.subtitle": { de: "Deine Behandlungsreise", en: "Your treatment journey", es: "Tu recorrido de tratamiento" },
  "journey.completed": { de: "✓ Abgeschlossen", en: "✓ Completed", es: "✓ Completado" },
  "journey.active": { de: "● Aktiv", en: "● Active", es: "● Activo" },
  "journey.upcoming": { de: "Bald", en: "Soon", es: "Pronto" },
  "journey.today": { de: "heute", en: "today", es: "hoy" },
  "journey.careTips": { de: "Pflegetipps", en: "Care tips", es: "Consejos de cuidado" },

  // Progress
  "progress.title": { de: "Dein Fortschritt", en: "Your progress", es: "Tu avance" },
  "progress.subtitle": { de: "Du bist auf einem tollen Weg", en: "You're doing great", es: "Vas muy bien" },
  "progress.invested": { de: "INVESTIERT", en: "INVESTED", es: "INVERTIDO" },
  "progress.investedLabel": { de: "Investiert", en: "Invested", es: "Invertido" },
  "progress.open": { de: "Offen", en: "Open", es: "Pendiente" },
  "progress.total": { de: "Gesamt", en: "Total", es: "Total" },
  "progress.overdue": { de: "RATE ÜBERFÄLLIG", en: "PAYMENT OVERDUE", es: "PAGO VENCIDO" },
  "progress.since": { de: "Seit", en: "Since", es: "Desde" },
  "progress.of": { de: "VON", en: "OF", es: "DE" },
  "progress.nextPayment": { de: "Nächste Rate", en: "Next payment", es: "Próximo pago" },
  "progress.payNow": { de: "Jetzt ausgleichen", en: "Pay now", es: "Pagar ahora" },
  "progress.history": { de: "Historie", en: "History", es: "Historial" },
  "progress.monthlyRate": { de: "Monatsrate", en: "Monthly payment", es: "Cuota mensual" },

  // Chat
  "chat.title": { de: "Praxis Chat", en: "Practice Chat", es: "Chat Clínica" },
  "chat.practice": { de: "Praxis Dr. Schubert", en: "Dr. Schubert Practice", es: "Clínica Dr. Schubert" },
  "chat.icuraNote": { de: "iCura beantwortet häufige Fragen sofort.", en: "iCura answers common questions instantly.", es: "iCura responde preguntas frecuentes al instante." },
  "chat.placeholder": { de: "Nachricht schreiben...", en: "Write a message...", es: "Escribe un mensaje..." },
  "chat.typing": { de: "schreibt gerade...", en: "is typing...", es: "está escribiendo..." },

  // More
  "more.title": { de: "Mehr", en: "More", es: "Más" },
  "more.documents": { de: "Dokumente", en: "Documents", es: "Documentos" },
  "more.consult": { de: "Beratungsgespräch", en: "Consultation", es: "Consulta" },
  "more.consultText": { de: "Fragen zu deinem Ratenplan? Starte ein Videogespräch mit unserem Praxisberater.", en: "Questions about your payment plan? Start a video call with our practice advisor.", es: "¿Preguntas sobre tu plan de pagos? Inicia una videollamada con nuestro asesor." },
  "more.requestConsult": { de: "Gespräch anfragen", en: "Request consultation", es: "Solicitar consulta" },
  "more.aboutApp": { de: "Über diese App", en: "About this app", es: "Acerca de esta app" },
  "more.aboutText": { de: "Anima Cura Patientenportal — Praxis Dr. Maria Schubert, Leipzig.", en: "Anima Cura Patient Portal — Dr. Maria Schubert Practice, Leipzig.", es: "Portal de Pacientes Anima Cura — Clínica Dr. Maria Schubert, Leipzig." },
  "more.logout": { de: "Abmelden", en: "Sign out", es: "Cerrar sesión" },

  // Doc drawer
  "doc.uploadedOn": { de: "Hochgeladen am", en: "Uploaded on", es: "Subido el" },
  "doc.share": { de: "Teilen", en: "Share", es: "Compartir" },
  "doc.download": { de: "Herunterladen", en: "Download", es: "Descargar" },
  "doc.close": { de: "Schließen", en: "Close", es: "Cerrar" },

  // IBAN
  "iban.title": { de: "Offene Rate ausgleichen", en: "Settle open payment", es: "Saldar pago pendiente" },
  "iban.subtitle": { de: "Bitte überweise den offenen Betrag an folgende Bankverbindung:", en: "Please transfer the open amount to the following bank details:", es: "Por favor transfiera el monto pendiente a los siguientes datos bancarios:" },
  "iban.recipient": { de: "Empfänger", en: "Recipient", es: "Destinatario" },
  "iban.amount": { de: "Betrag", en: "Amount", es: "Monto" },
  "iban.reference": { de: "Verwendungszweck", en: "Reference", es: "Referencia" },
  "iban.rate": { de: "Rate", en: "Payment", es: "Cuota" },
  "iban.copy": { de: "IBAN kopieren", en: "Copy IBAN", es: "Copiar IBAN" },

  // Badges
  "badge.unlocked": { de: "Freigeschaltet ✓", en: "Unlocked ✓", es: "Desbloqueado ✓" },
  "badge.locked": { de: "Noch nicht erreicht", en: "Not yet reached", es: "Aún no alcanzado" },

  // Phase drawer
  "phase.completed": { de: "Abgeschlossen", en: "Completed", es: "Completado" },
  "phase.activePhase": { de: "Aktive Phase", en: "Active phase", es: "Fase activa" },
  "phase.upcoming": { de: "Kommende Phase", en: "Upcoming phase", es: "Próxima fase" },
  "phase.tipsForPhase": { de: "Tipps für diese Phase", en: "Tips for this phase", es: "Consejos para esta fase" },

  // Loading
  "loading": { de: "Wird geladen...", en: "Loading...", es: "Cargando..." },
  "loading.credentials": { de: "Zugangsdaten erhältst du in deiner Praxis.", en: "Get your credentials at your practice.", es: "Obtén tus credenciales en tu clínica." },
};

export function t(key: string, lang: Lang): string {
  return dict[key]?.[lang] ?? dict[key]?.["de"] ?? key;
}

export const langLabels: Record<Lang, string> = { de: "DE", en: "EN", es: "ES" };
