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

// Phase name + description mapping (DB values are German, this translates them)
const phaseMap: Record<string, Record<Lang, { name: string; beschreibung: string }>> = {
  "Initialuntersuchung": {
    de: { name: "Initialuntersuchung", beschreibung: "Abdrücke, Scans und Behandlungsplanung." },
    en: { name: "Initial examination", beschreibung: "Impressions, scans and treatment planning." },
    es: { name: "Exploración inicial", beschreibung: "Impresiones, escaneos y planificación del tratamiento." },
  },
  "Aligner Set 1-11": {
    de: { name: "Aligner Set 1-11", beschreibung: "Erste Bewegungsphase, Gewöhnung an die Schienen." },
    en: { name: "Aligner Set 1-11", beschreibung: "First movement phase, getting used to the aligners." },
    es: { name: "Alineadores Set 1-11", beschreibung: "Primera fase de movimiento, adaptación a las férulas." },
  },
  "Aligner Set 12-24": {
    de: { name: "Aligner Set 12-24", beschreibung: "Feinjustierung der Rotationen im Oberkiefer." },
    en: { name: "Aligner Set 12-24", beschreibung: "Fine-tuning rotations in the upper jaw." },
    es: { name: "Alineadores Set 12-24", beschreibung: "Ajuste fino de las rotaciones en el maxilar superior." },
  },
  "Retainer & Abschluss": {
    de: { name: "Retainer & Abschluss", beschreibung: "Stabilisierung des Ergebnisses." },
    en: { name: "Retainer & completion", beschreibung: "Stabilizing the results." },
    es: { name: "Retenedor y finalización", beschreibung: "Estabilización del resultado." },
  },
};

export function translatePhase(deName: string, lang: Lang): { name: string; beschreibung: string } {
  return phaseMap[deName]?.[lang] ?? { name: deName, beschreibung: "" };
}

// Phase detail button labels
const phaseButtonMap: Record<string, Record<Lang, string>> = {
  "Was passiert genau?": { de: "Was passiert genau?", en: "What exactly happens?", es: "¿Qué sucede exactamente?" },
  "Wie lange dauert das?": { de: "Wie lange dauert das?", en: "How long does it take?", es: "¿Cuánto tiempo tarda?" },
  "Was du beachten solltest": { de: "Was du beachten solltest", en: "What you should know", es: "Lo que debes tener en cuenta" },
  "Ergebnis": { de: "Ergebnis", en: "Result", es: "Resultado" },
  "Tragezeit": { de: "Tragezeit", en: "Wearing time", es: "Tiempo de uso" },
  "Tipps für den Alltag": { de: "Tipps für den Alltag", en: "Everyday tips", es: "Consejos para el día a día" },
  "Fortschritte": { de: "Fortschritte", en: "Progress", es: "Avances" },
  "Attachments": { de: "Attachments", en: "Attachments", es: "Attachments" },
  "Aktueller Fokus": { de: "Aktueller Fokus", en: "Current focus", es: "Enfoque actual" },
  "Trageschema": { de: "Trageschema", en: "Wearing schedule", es: "Esquema de uso" },
  "Pflege": { de: "Pflege", en: "Care", es: "Cuidado" },
  "Dein Ergebnis": { de: "Dein Ergebnis", en: "Your result", es: "Tu resultado" },
};

export function translatePhaseButton(deTitle: string, lang: Lang): string {
  return phaseButtonMap[deTitle]?.[lang] ?? deTitle;
}

// Badge translations
const badgeMap: Record<string, Record<Lang, { titel: string; beschreibung: string }>> = {
  "3 Monate pünktlich": {
    de: { titel: "3 Monate pünktlich", beschreibung: "Drei Raten ohne Verzögerung" },
    en: { titel: "3 months on time", beschreibung: "Three payments without delay" },
    es: { titel: "3 meses puntual", beschreibung: "Tres cuotas sin retraso" },
  },
  "6 Monate pünktlich": {
    de: { titel: "6 Monate pünktlich", beschreibung: "Sechs Raten ohne Verzögerung" },
    en: { titel: "6 months on time", beschreibung: "Six payments without delay" },
    es: { titel: "6 meses puntual", beschreibung: "Seis cuotas sin retraso" },
  },
  "12 Monate pünktlich": {
    de: { titel: "12 Monate pünktlich", beschreibung: "Zwölf Raten ohne Verzögerung" },
    en: { titel: "12 months on time", beschreibung: "Twelve payments without delay" },
    es: { titel: "12 meses puntual", beschreibung: "Doce cuotas sin retraso" },
  },
  "Halbzeit!": {
    de: { titel: "Halbzeit!", beschreibung: "Mehr als 50% investiert" },
    en: { titel: "Halfway!", beschreibung: "More than 50% invested" },
    es: { titel: "¡Mitad de camino!", beschreibung: "Más del 50% invertido" },
  },
  "Phase 1 geschafft": {
    de: { titel: "Phase 1 geschafft", beschreibung: "Erste Behandlungsphase abgeschlossen" },
    en: { titel: "Phase 1 complete", beschreibung: "First treatment phase completed" },
    es: { titel: "Fase 1 completada", beschreibung: "Primera fase de tratamiento completada" },
  },
  "Zielgerade": {
    de: { titel: "Zielgerade", beschreibung: "75% investiert" },
    en: { titel: "Home stretch", beschreibung: "75% invested" },
    es: { titel: "Recta final", beschreibung: "75% invertido" },
  },
  "Geschafft!": {
    de: { titel: "Geschafft!", beschreibung: "Behandlung komplett" },
    en: { titel: "Done!", beschreibung: "Treatment complete" },
    es: { titel: "¡Logrado!", beschreibung: "Tratamiento completo" },
  },
};

export function translateBadge(deTitel: string, lang: Lang): { titel: string; beschreibung: string } {
  return badgeMap[deTitel]?.[lang] ?? { titel: deTitel, beschreibung: "" };
}

// Phase detail content - summary, fokus, expandable sections
type PhaseDetail = { emoji: string; summary: string; fokus?: string; details: { title: string }[] };

const phaseContent: Record<string, Record<Lang, PhaseDetail>> = {
  "Initialuntersuchung": {
    de: { emoji: "🔍", summary: "Der erste Schritt deiner Behandlung. Hier werden alle wichtigen Daten erhoben: digitale Scans, Fotos, Röntgenbilder. Daraus entsteht dein individueller Behandlungsplan.", fokus: "Alle Unterlagen und Befunde für die Behandlungsplanung zusammentragen. Falls du noch offene Fragen hast, ist jetzt der beste Zeitpunkt sie zu stellen.", details: [{ title: "Was passiert genau?" }, { title: "Wie lange dauert das?" }, { title: "Was du beachten solltest" }, { title: "Ergebnis" }] },
    en: { emoji: "🔍", summary: "The first step of your treatment. All important data is collected here: digital scans, photos, X-rays. From this, your individual treatment plan is created.", fokus: "Gather all documents and findings for treatment planning. If you have any open questions, now is the best time to ask them.", details: [{ title: "What exactly happens?" }, { title: "How long does it take?" }, { title: "What you should know" }, { title: "Result" }] },
    es: { emoji: "🔍", summary: "El primer paso de tu tratamiento. Aquí se recopilan todos los datos importantes: escaneos digitales, fotos, radiografías. A partir de esto se crea tu plan de tratamiento individual.", fokus: "Reúne todos los documentos y hallazgos para la planificación del tratamiento. Si tienes preguntas pendientes, ahora es el mejor momento para hacerlas.", details: [{ title: "¿Qué sucede exactamente?" }, { title: "¿Cuánto tiempo tarda?" }, { title: "Lo que debes tener en cuenta" }, { title: "Resultado" }] },
  },
  "Aligner Set 1-11": {
    de: { emoji: "🦷", summary: "Los geht's! Deine ersten Aligner-Schienen sind da. In dieser Phase gewöhnen sich deine Zähne an die Bewegung und die ersten größeren Korrekturen finden statt.", fokus: "Gewöhne dich an das konsequente Tragen der Schienen. 20-22 Stunden pro Tag sind ideal. Die erste Woche ist die schwierigste, danach wird es Routine.", details: [{ title: "Was passiert genau?" }, { title: "Wie lange dauert das?" }, { title: "Tragezeit" }, { title: "Tipps für den Alltag" }, { title: "Fortschritte" }] },
    en: { emoji: "🦷", summary: "Here we go! Your first aligner trays are here. In this phase, your teeth get used to movement and the first major corrections take place.", fokus: "Get used to wearing the trays consistently. 20-22 hours per day is ideal. The first week is the hardest, after that it becomes routine.", details: [{ title: "What exactly happens?" }, { title: "How long does it take?" }, { title: "Wearing time" }, { title: "Everyday tips" }, { title: "Progress" }] },
    es: { emoji: "🦷", summary: "¡Comenzamos! Tus primeras férulas de alineación están aquí. En esta fase, tus dientes se acostumbran al movimiento y se realizan las primeras correcciones importantes.", fokus: "Acostúmbrate a usar las férulas de forma constante. 20-22 horas al día es lo ideal. La primera semana es la más difícil, después se vuelve rutina.", details: [{ title: "¿Qué sucede exactamente?" }, { title: "¿Cuánto tiempo tarda?" }, { title: "Tiempo de uso" }, { title: "Consejos para el día a día" }, { title: "Avances" }] },
  },
  "Aligner Set 12-24": {
    de: { emoji: "✨", summary: "Die zweite Hälfte deiner Aligner-Behandlung. Jetzt geht es um Feinjustierung: Rotationen im Oberkiefer, Bisslage optimieren, letzte Korrekturen.", fokus: "Achte in dieser Phase besonders auf die Kaumuskelspannung. Leichte Massagen helfen bei erstem Druckgefühl in den ersten Tagen nach einem Schienenwechsel.", details: [{ title: "Was passiert genau?" }, { title: "Attachments" }, { title: "Aktueller Fokus" }, { title: "Fortschritte" }] },
    en: { emoji: "✨", summary: "The second half of your aligner treatment. Now it's about fine-tuning: rotations in the upper jaw, optimizing bite, final corrections.", fokus: "Pay special attention to jaw muscle tension in this phase. Gentle massages help with initial pressure feeling in the first days after switching trays.", details: [{ title: "What exactly happens?" }, { title: "Attachments" }, { title: "Current focus" }, { title: "Progress" }] },
    es: { emoji: "✨", summary: "La segunda mitad de tu tratamiento con alineadores. Ahora se trata de ajuste fino: rotaciones en el maxilar superior, optimización de la mordida, correcciones finales.", fokus: "Presta especial atención a la tensión de los músculos de la mandíbula en esta fase. Los masajes suaves ayudan con la presión inicial en los primeros días después de cambiar de férula.", details: [{ title: "¿Qué sucede exactamente?" }, { title: "Attachments" }, { title: "Enfoque actual" }, { title: "Avances" }] },
  },
  "Retainer & Abschluss": {
    de: { emoji: "🛡️", summary: "Geschafft! Die aktive Behandlung ist abgeschlossen. Jetzt geht es darum dein Ergebnis langfristig zu stabilisieren.", fokus: "Trage deinen Retainer konsequent. In den ersten Monaten jede Nacht, danach nach Absprache. Deine Zähne wollen sich zurückbewegen, der Retainer verhindert das.", details: [{ title: "Was passiert genau?" }, { title: "Trageschema" }, { title: "Pflege" }, { title: "Dein Ergebnis" }] },
    en: { emoji: "🛡️", summary: "Done! The active treatment is complete. Now it's about stabilizing your result long-term.", fokus: "Wear your retainer consistently. Every night for the first months, then as agreed. Your teeth want to move back, the retainer prevents that.", details: [{ title: "What exactly happens?" }, { title: "Wearing schedule" }, { title: "Care" }, { title: "Your result" }] },
    es: { emoji: "🛡️", summary: "¡Listo! El tratamiento activo está completo. Ahora se trata de estabilizar tu resultado a largo plazo.", fokus: "Usa tu retenedor de forma constante. Todas las noches durante los primeros meses, luego según lo acordado. Tus dientes quieren volver a moverse, el retenedor lo impide.", details: [{ title: "¿Qué sucede exactamente?" }, { title: "Esquema de uso" }, { title: "Cuidado" }, { title: "Tu resultado" }] },
  },
};

export function getPhaseContent(deName: string, lang: Lang): PhaseDetail {
  return phaseContent[deName]?.[lang] ?? phaseContent[deName]?.["de"] ?? { emoji: "📋", summary: "", details: [] };
}

// Pflegetipp text translations (DB values are German)
const tippMap: Record<string, Record<Lang, string>> = {
  "Nach dem Einsetzen der Brackets können die Zähne empfindlich sein. Weiche Nahrung wie Suppen und Joghurt helfen in den ersten Tagen.": {
    de: "Nach dem Einsetzen der Brackets können die Zähne empfindlich sein. Weiche Nahrung wie Suppen und Joghurt helfen in den ersten Tagen.",
    en: "After getting your brackets, teeth can be sensitive. Soft foods like soups and yogurt help in the first few days.",
    es: "Después de colocar los brackets, los dientes pueden estar sensibles. Alimentos blandos como sopas y yogur ayudan en los primeros días.",
  },
  "Bei Druckstellen auf der Wangenschleimhaut hilft orthodontisches Wachs. Einfach ein kleines Stück auf den störenden Bracket drücken.": {
    de: "Bei Druckstellen auf der Wangenschleimhaut hilft orthodontisches Wachs. Einfach ein kleines Stück auf den störenden Bracket drücken.",
    en: "For pressure sores on the cheek lining, orthodontic wax helps. Just press a small piece onto the irritating bracket.",
    es: "Para las llagas por presión en la mucosa, la cera ortodóntica ayuda. Solo presiona un pequeño trozo sobre el bracket que molesta.",
  },
  "Putze nach jeder Mahlzeit gründlich mit einer speziellen Bracket-Zahnbürste. Besonders die Bereiche um die Brackets herum brauchen Aufmerksamkeit.": {
    de: "Putze nach jeder Mahlzeit gründlich mit einer speziellen Bracket-Zahnbürste. Besonders die Bereiche um die Brackets herum brauchen Aufmerksamkeit.",
    en: "Brush thoroughly after every meal with a special bracket toothbrush. The areas around the brackets need particular attention.",
    es: "Cepilla a fondo después de cada comida con un cepillo especial para brackets. Las áreas alrededor de los brackets necesitan atención especial.",
  },
  "Interdentalbürsten sind jetzt besonders wichtig. Nutze sie täglich, um Essensreste zwischen den Brackets zu entfernen.": {
    de: "Interdentalbürsten sind jetzt besonders wichtig. Nutze sie täglich, um Essensreste zwischen den Brackets zu entfernen.",
    en: "Interdental brushes are especially important now. Use them daily to remove food debris between brackets.",
    es: "Los cepillos interdentales son especialmente importantes ahora. Úsalos diariamente para eliminar restos de comida entre los brackets.",
  },
  "Vermeide harte und klebrige Lebensmittel wie Nüsse, Karamell oder Kaugummi. Sie können Brackets lösen oder Drähte verbiegen.": {
    de: "Vermeide harte und klebrige Lebensmittel wie Nüsse, Karamell oder Kaugummi. Sie können Brackets lösen oder Drähte verbiegen.",
    en: "Avoid hard and sticky foods like nuts, caramel, or chewing gum. They can loosen brackets or bend wires.",
    es: "Evita alimentos duros y pegajosos como nueces, caramelo o chicle. Pueden aflojar los brackets o doblar los alambres.",
  },
  "Trage deine Gummizüge konsequent wie besprochen. Sie sind entscheidend für die korrekte Bisslage.": {
    de: "Trage deine Gummizüge konsequent wie besprochen. Sie sind entscheidend für die korrekte Bisslage.",
    en: "Wear your rubber bands consistently as discussed. They are crucial for the correct bite position.",
    es: "Usa tus elásticos de forma constante como se acordó. Son cruciales para la posición correcta de la mordida.",
  },
  "Halte deine Kontrolltermine zuverlässig ein. Versäumte Termine können die Behandlung um Wochen verlängern.": {
    de: "Halte deine Kontrolltermine zuverlässig ein. Versäumte Termine können die Behandlung um Wochen verlängern.",
    en: "Keep your check-up appointments reliably. Missed appointments can extend treatment by weeks.",
    es: "Mantén tus citas de control de forma fiable. Las citas perdidas pueden alargar el tratamiento semanas.",
  },
  "Trage deinen Retainer jede Nacht. Ohne Retainer können sich die Zähne wieder verschieben.": {
    de: "Trage deinen Retainer jede Nacht. Ohne Retainer können sich die Zähne wieder verschieben.",
    en: "Wear your retainer every night. Without a retainer, teeth can shift back.",
    es: "Usa tu retenedor cada noche. Sin retenedor, los dientes pueden moverse de nuevo.",
  },
  "Reinige den Retainer täglich mit einer weichen Zahnbürste. Kein heißes Wasser verwenden, das verformt den Kunststoff.": {
    de: "Reinige den Retainer täglich mit einer weichen Zahnbürste. Kein heißes Wasser verwenden, das verformt den Kunststoff.",
    en: "Clean your retainer daily with a soft toothbrush. Don't use hot water, it warps the plastic.",
    es: "Limpia tu retenedor diariamente con un cepillo suave. No uses agua caliente, deforma el plástico.",
  },
};

export function translateTipp(deText: string, lang: Lang): string {
  return tippMap[deText]?.[lang] ?? deText;
}
