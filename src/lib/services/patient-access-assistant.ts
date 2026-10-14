export function answerAccessQuestion(message: string, locale: "de" | "en") {
  const value = message.toLocaleLowerCase(locale === "de" ? "de-DE" : "en-US");
  if (/noch kein.*(zugang|konto)|kein.*(zugang|konto)|account.*(erstellen|aktivieren)|erstmal.*aktivier|selb(er|st).*(registrier|anmeld|aktivier)|registrier.*ohne.*praxis|ohne.*praxis.*registrier/.test(value)) {
    return locale === "en"
      ? "On the sign-in page, tap ‘No access yet? Activate patient account’. Enter the patient number from your invoice or practice documents, your date of birth, and the private contact email registered with the practice. Enter the six-digit code from that email in the open app and set your own password twice. This connects you to the existing patient record; it does not create a new record or medical history form."
      : "Ja – wenn du bereits Patientin oder Patient der Praxis bist, kannst du deinen Zugang selbst aktivieren. Tippe auf der Anmeldeseite auf „Noch keinen Zugang? Patientenkonto aktivieren“. Gib deine Patientennummer, dein Geburtsdatum und die private Kontakt-E-Mail ein, die bei der Praxis hinterlegt ist. Trage anschließend den sechsstelligen Code aus dieser E-Mail in der geöffneten App ein und lege dein eigenes Passwort fest. Du wirst mit deiner bestehenden Patientenakte verbunden; es entsteht weder eine neue Akte noch ein neuer Anamnesebogen.";
  }
  if (/passwort|password|anmelden|login|einlog|zugang|code/.test(value)) {
    return locale === "en"
      ? "Tap ‘Forgot password?’ below the password field. Enter your Anima Cura sign-in address, type the six-digit code from your contact email in the open app, and set your new password twice. You will then return to the invoice you originally opened."
      : "Tippe unter dem Passwortfeld auf „Passwort vergessen?“. Gib dort deine persönliche Anima-Cura-Anmeldeadresse ein. Sie endet meist auf @animacura.de, dient nur als Benutzername und empfängt selbst keine E-Mails. Den sechsstelligen Code erhältst du an deine bei der Praxis hinterlegte private Kontakt-E-Mail. Trage den Code in der geöffneten App ein und vergib dein neues Passwort zweimal. Danach kommst du direkt zur zuvor geöffneten Rechnung zurück.";
  }
  if (/rechnung|invoice|dokument|document|öffnen|oeffnen/.test(value)) {
    return locale === "en"
      ? "Open the invoice button in the email and sign in. After sign-in, Anima Cura opens the matching invoice automatically. Future invoices are available in the patient portal under Documents."
      : "Öffne den Rechnungsbutton in der E-Mail und melde dich an. Nach der Anmeldung öffnet Anima Cura automatisch die passende Rechnung. Künftige Rechnungen findest du im Patientenportal unter „Dokumente“.";
  }
  if (/qr|überweis|ueberweis|bank|zahl|payment|rate/.test(value)) {
    return locale === "en"
      ? "The QR code on the invoice opens the protected patient portal. After sign-in, open the invoice or payment area and choose the banking QR code or a normal bank transfer. For questions about a specific amount, contact the practice team."
      : "Der QR-Code auf der Rechnung öffnet das geschützte Patientenportal. Öffne nach der Anmeldung die Rechnung oder den Zahlungsbereich und wähle dort Banking-QR oder normale Überweisung. Bei Fragen zu einem konkreten Betrag wende dich an das Praxisteam.";
  }
  if (/email|e-mail|adresse|mail/.test(value)) {
    return locale === "en"
      ? "Use the dedicated Anima Cura sign-in address shown in your access email. It may differ from your normal contact email. If you no longer have that message, email praxisteam@animacura.io."
      : "Nutze die eigene Anima-Cura-Anmeldeadresse aus deiner Zugangs-E-Mail. Sie kann von deiner normalen Kontakt-E-Mail abweichen. Wenn du diese Nachricht nicht mehr hast, schreibe an praxisteam@animacura.io.";
  }
  return locale === "en"
    ? "I can guide you through sign-in, password reset, invoices, and payments. For a medical question or a question about a specific amount, email praxisteam@animacura.io. Never send your password or security code."
    : "Ich helfe dir bei Anmeldung, Passwort, Rechnungen und Zahlung. Bei medizinischen Fragen oder einem konkreten Rechnungsbetrag schreibe an praxisteam@animacura.io. Sende niemals dein Passwort oder deinen Sicherheitscode.";
}
