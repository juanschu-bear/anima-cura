export const SUPPORT_KNOWLEDGE_VERSION = "2026-10-14.2";

export type SupportKnowledgeCategory =
  | "login_password"
  | "invoice_access"
  | "payment_method"
  | "portal_setup";

export type SupportKnowledgeEntry = {
  id: string;
  title: string;
  categories: SupportKnowledgeCategory[];
  keywords: string[];
  content: string;
  kind?: "procedure" | "explanation" | "policy";
  answerScope?: string;
};

export const SUPPORT_CATEGORY_LABELS: Record<SupportKnowledgeCategory, string> = {
  login_password: "Anmeldung und Passwort",
  invoice_access: "Rechnungszugang",
  payment_method: "Zahlungsweg",
  portal_setup: "App und Benachrichtigungen",
};

export const SUPPORT_KNOWLEDGE: readonly SupportKnowledgeEntry[] = [
  {
    id: "access.self-activation",
    title: "Bestehenden Patientenzugang selbst aktivieren",
    categories: ["login_password"],
    keywords: ["noch kein zugang", "noch keinen zugang", "kein konto", "account erstellen", "aktivieren", "patientennummer", "noch nie angemeldet"],
    content: "Wer bereits Patient der Praxis ist, aber noch keinen Anima-Cura-Zugang genutzt hat, wählt auf der Anmeldeseite „Noch keinen Zugang? Patientenkonto aktivieren“. Benötigt werden Patientennummer, Geburtsdatum und die private Kontakt-E-Mail, die bereits bei der Praxis hinterlegt ist. Stimmen alle Angaben überein, wird ein sechsstelliger Sicherheitscode an diese private Kontakt-E-Mail geschickt. Danach legt der Patient sein eigenes Passwort fest und wird direkt angemeldet. Es wird keine neue Patientenakte und kein neuer Anamnesebogen erstellt.",
    kind: "procedure",
    answerScope: "Leitet bestehende Patienten durch die sichere erstmalige Aktivierung.",
  },
  {
    id: "access.portal-address",
    title: "Anima-Cura-Anmeldeadresse",
    categories: ["login_password"],
    keywords: ["email", "e-mail", "adresse", "anmeldedaten", "zugangsdaten", "welche adresse"],
    content: "Für die Anmeldung wird die persönliche Anima-Cura-Anmeldeadresse aus der Zugangs-E-Mail verwendet. Sie kann von der normalen Kontakt-E-Mail des Patienten abweichen. Das Passwort oder ein Sicherheitscode darf niemals per E-Mail an den Support geschickt werden.",
    kind: "explanation",
    answerScope: "Erklärt ausschließlich, welche Adresse zur Anmeldung gehört.",
  },
  {
    id: "access.password-recovery",
    title: "Passwort selbst zurücksetzen",
    categories: ["login_password"],
    keywords: ["passwort", "vergessen", "falsch", "anmelden", "login", "sicherheitscode", "code"],
    content: "Auf der Anmeldeseite befindet sich unter dem Passwortfeld die Funktion „Passwort vergessen?“. Der Patient gibt dort seine persönliche Anima-Cura-Anmeldeadresse ein. Sie endet meist auf @animacura.de, dient ausschließlich als Benutzername und kann keine E-Mails empfangen. Ein sechsstelliger, zehn Minuten gültiger Sicherheitscode wird an die bei der Praxis hinterlegte private Kontakt-E-Mail geschickt. Danach wird das neue Passwort zweimal eingegeben und gespeichert.",
    kind: "procedure",
    answerScope: "Leitet durch den vorhandenen Wiederherstellungsablauf.",
  },
  {
    id: "access.return-to-invoice",
    title: "Nach Anmeldung zur Rechnung zurückkehren",
    categories: ["login_password", "invoice_access"],
    keywords: ["rechnung", "zurück", "login", "qr", "button", "link", "weiterleitung"],
    content: "Wurde Anima Cura über den Button oder QR-Code einer Rechnung geöffnet, bleibt dieses Rechnungsziel während Anmeldung und Passwortwechsel erhalten. Nach erfolgreicher Anmeldung öffnet sich wieder der zuvor aufgerufene Rechnungsbereich.",
    kind: "explanation",
    answerScope: "Erklärt die Rückkehr zur zuvor geöffneten Rechnung.",
  },
  {
    id: "portal.install",
    title: "Anima Cura auf dem Smartphone einrichten",
    categories: ["portal_setup"],
    keywords: ["app", "installieren", "einrichten", "smartphone", "handy", "home-bildschirm", "homescreen"],
    content: "Anima Cura wird über den persönlichen Zugangs- oder Rechnungslink im Smartphone-Browser geöffnet. Dort kann das Patientenportal über die Browserfunktion „Zum Home-Bildschirm“ beziehungsweise „Zum Startbildschirm hinzufügen“ wie eine App abgelegt werden. Die Anmeldung erfolgt mit der persönlichen Anima-Cura-Anmeldeadresse.",
    kind: "procedure",
    answerScope: "Beschreibt die Installation als App-Verknüpfung.",
  },
  {
    id: "portal.notifications",
    title: "Benachrichtigungen aktivieren",
    categories: ["portal_setup"],
    keywords: ["benachrichtigung", "push", "mitteilung", "erinnerung", "informiert"],
    content: "Benachrichtigungen sollten für Anima Cura zugelassen werden, damit Hinweise auf neue Rechnungen oder wichtige Praxisnachrichten nicht übersehen werden. Wird die Berechtigung nicht angezeigt oder wurde sie abgelehnt, kann sie in den Browser- oder Geräteeinstellungen für Anima Cura erneut aktiviert werden.",
    kind: "procedure",
    answerScope: "Erklärt Aktivierung und erneute Freigabe von Mitteilungen.",
  },
  {
    id: "invoice.find-documents",
    title: "Bereitgestellte Rechnungen finden",
    categories: ["invoice_access"],
    keywords: ["rechnung", "dokument", "finden", "öffnen", "sehen", "abrufen", "app"],
    content: "Bereits digital bereitgestellte Rechnungen sind nach der Anmeldung im geschützten Patientenportal im Bereich „Dokumente“ beziehungsweise „Rechnungen“ verfügbar. Der Rechnungsbutton aus der Benachrichtigungs-E-Mail führt über die Anmeldung zur passenden Rechnung.",
    kind: "procedure",
    answerScope: "Nennt ausschließlich die vorhandenen Fundstellen im Portal.",
  },
  {
    id: "invoice.protected-link",
    title: "Warum der Rechnungslink zur Anmeldung führt",
    categories: ["invoice_access"],
    keywords: ["warum", "login", "anmeldung", "qr", "direkt", "schutz"],
    content: "Rechnungsdaten sind geschützt. Deshalb kann ein Rechnungsbutton oder QR-Code zunächst die Anmeldeseite zeigen. Nach erfolgreicher Anmeldung wird die zugehörige Rechnung geöffnet. Die E-Mail selbst enthält aus Datenschutzgründen nicht alle Rechnungs- und Zahlungsdaten offen.",
    kind: "explanation",
    answerScope: "Erklärt den vorgeschalteten Login ohne Rechnungsdaten offenzulegen.",
  },
  {
    id: "payment.supported-methods",
    title: "Verfügbare Zahlungswege",
    categories: ["payment_method"],
    keywords: ["zahlen", "zahlung", "überweisung", "banking", "qr", "bank", "zahlungsweg"],
    content: "Im geschützten Rechnungs- oder Zahlungsbereich stehen Banking-QR und normale Banküberweisung zur Verfügung. Beide Zahlungswege sind möglich. Maßgeblich sind Rechnungsbetrag, Verwendungszweck und Zahlungsfrist der bereitgestellten Rechnung.",
    kind: "procedure",
    answerScope: "Nennt Zahlungswege, bewertet aber keine konkrete Zahlung.",
  },
  {
    id: "payment.case-escalation",
    title: "Individuelle Zahlungsfragen weitergeben",
    categories: ["payment_method"],
    keywords: ["betrag", "rate", "ratenplan", "bezahlt", "verbucht", "mahnung", "falsch"],
    content: "Fragen zu einem konkreten Betrag, einer bereits geleisteten Zahlung, einem Ratenplan, einer Mahnung oder einer Buchung dürfen nicht automatisch bewertet werden. Diese Fälle müssen persönlich geprüft werden.",
    kind: "policy",
    answerScope: "Stoppt die automatische Antwort und verlangt manuelle Prüfung.",
  },
  {
    id: "access.contact-vs-login-address",
    title: "Kontaktadresse und Anmeldeadresse unterscheiden",
    categories: ["login_password"],
    keywords: ["kontaktadresse", "anmeldeadresse", "andere email", "abweichend"],
    content: "Die persönliche Anima-Cura-Anmeldeadresse identifiziert das Portal-Konto. Sie ist ein technischer Benutzername und kein E-Mail-Postfach. Der Sicherheitscode zur Passwortwiederherstellung wird dagegen an die bei der Praxis hinterlegte private Kontakt-E-Mail geschickt, zum Beispiel Gmail, GMX oder Web.de. Beide Adressen sind deshalb absichtlich unterschiedlich.",
    kind: "explanation",
    answerScope: "Klärt die beiden Adressrollen, ohne eine Adresse offenzulegen.",
  },
  {
    id: "access.security-code-validity",
    title: "Gültigkeit des Sicherheitscodes",
    categories: ["login_password"],
    keywords: ["code", "abgelaufen", "zehn minuten", "gültig", "sechsstellig"],
    content: "Der sechsstellige Sicherheitscode zur Passwortwiederherstellung ist zehn Minuten gültig. Ein abgelaufener oder bereits verwendeter Code kann nicht erneut eingesetzt werden; in diesem Fall muss der Wiederherstellungsprozess neu gestartet werden.",
    kind: "procedure",
    answerScope: "Erklärt Codeformat und Ablaufzeit.",
  },
  {
    id: "access.password-requirements",
    title: "Neues Passwort festlegen",
    categories: ["login_password"],
    keywords: ["neues passwort", "zweimal", "acht zeichen", "speichern"],
    content: "Das neue Passwort wird im Wiederherstellungsablauf zweimal eingegeben und muss mindestens acht Zeichen lang sein. Es wird ausschließlich über die geschützte Anima-Cura-Seite festgelegt und niemals per E-Mail an den Support übermittelt.",
    kind: "procedure",
    answerScope: "Nennt die technisch geprüften Passwortanforderungen.",
  },
  {
    id: "access.no-original-email",
    title: "Ursprüngliche Zugangs-E-Mail fehlt",
    categories: ["login_password"],
    keywords: ["email weg", "zugangsmail", "nicht mehr", "verloren"],
    content: "Ist die ursprüngliche Zugangs-E-Mail nicht mehr vorhanden, kann die Anmeldung trotzdem über die persönliche Anima-Cura-Anmeldeadresse und „Passwort vergessen?“ wiederhergestellt werden. Ist auch die Anmeldeadresse unbekannt, muss der technische Support den zugehörigen Portalzugang prüfen.",
    kind: "procedure",
    answerScope: "Trennt Selbsthilfe von einer notwendigen Zugangsklärung.",
  },
  {
    id: "portal.ios-install",
    title: "Installation auf iPhone und iPad",
    categories: ["portal_setup"],
    keywords: ["iphone", "ipad", "safari", "home-bildschirm", "ios"],
    content: "Auf iPhone oder iPad wird Anima Cura in Safari geöffnet. Über das Teilen-Symbol wird „Zum Home-Bildschirm“ und anschließend „Hinzufügen“ gewählt. Danach erscheint Anima Cura wie eine App auf dem Gerät.",
    kind: "procedure",
    answerScope: "Beschreibt den in der App erklärten iOS-Ablauf.",
  },
  {
    id: "portal.android-install",
    title: "Installation auf Android",
    categories: ["portal_setup"],
    keywords: ["android", "chrome", "startbildschirm", "installieren"],
    content: "Auf Android wird der persönliche Anima-Cura-Link im Browser geöffnet. Über das Browsermenü wird Anima Cura zum Startbildschirm hinzugefügt. Die Bezeichnung kann je nach Browser „App installieren“ oder „Zum Startbildschirm hinzufügen“ lauten.",
    kind: "procedure",
    answerScope: "Beschreibt die browserabhängige Android-Installation.",
  },
  {
    id: "portal.notification-test",
    title: "Benachrichtigungsstatus prüfen",
    categories: ["portal_setup"],
    keywords: ["push status", "test", "keine mitteilung", "benachrichtigung testen"],
    content: "Im Patientenportal ist der aktuelle Push-Status sichtbar. Dort können Mitteilungen erneut aktiviert und mit einer Testbenachrichtigung geprüft werden. Bleibt die Freigabe aus, müssen die Mitteilungseinstellungen des Geräts oder Browsers kontrolliert werden.",
    kind: "procedure",
    answerScope: "Leitet zur vorhandenen Push-Diagnose im Portal.",
  },
  {
    id: "portal.available-areas",
    title: "Welche Bereiche das Patientenportal enthält",
    categories: ["portal_setup", "invoice_access"],
    keywords: ["was sehe ich", "bereiche", "behandlung", "dokumente", "zahlungen", "nachrichten"],
    content: "Das Patientenportal bündelt freigegebene Behandlungsinformationen, Dokumente, Rechnungen und Forderungen, Raten und Zahlungen sowie Nachrichten. Inhalte erscheinen, sobald sie dem jeweiligen Patientenprofil zugeordnet und freigegeben wurden.",
    kind: "explanation",
    answerScope: "Beschreibt verfügbare Bereiche, verspricht aber keine noch nicht freigegebenen Inhalte.",
  },
  {
    id: "invoice.not-yet-visible",
    title: "Rechnung oder Dokument noch nicht sichtbar",
    categories: ["invoice_access"],
    keywords: ["nicht sichtbar", "fehlt", "noch nicht", "leer", "keine rechnung"],
    content: "Ein Dokument erscheint erst, nachdem es dem richtigen Patientenprofil zugeordnet und für das Portal freigegeben wurde. Fehlt eine erwartete Rechnung trotz korrekter Anmeldung, muss die Zuordnung und Freigabe intern geprüft werden; der Patient soll den Anamnesebogen nicht erneut ausfüllen.",
    kind: "policy",
    answerScope: "Verhindert doppelte Anamnesebögen und leitet zur internen Dokumentprüfung.",
  },
  {
    id: "invoice.status-meaning",
    title: "Bedeutung der Rechnungsstatus",
    categories: ["invoice_access", "payment_method"],
    keywords: ["offen", "bezahlt", "teilbezahlt", "status", "noch offen"],
    content: "Im Portal können Rechnungen als offen, teilbezahlt oder bezahlt erscheinen. Bei teilbezahlten Rechnungen werden bereits gezahlter und noch offener Betrag getrennt dargestellt. Ob eine konkrete Zahlung korrekt verbucht wurde, darf nur nach persönlicher Prüfung bestätigt werden.",
    kind: "explanation",
    answerScope: "Erklärt Statusbegriffe, bestätigt aber keinen individuellen Zahlungseingang.",
  },
  {
    id: "invoice.document-protection",
    title: "Warum Rechnungen nicht vollständig in der E-Mail stehen",
    categories: ["invoice_access"],
    keywords: ["email", "anhang", "datenschutz", "warum login", "geschützt"],
    content: "Die Benachrichtigungs-E-Mail weist auf die Rechnung hin, enthält aber nicht sämtliche geschützten Rechnungs- und Patientendaten. Die vollständige Rechnung wird erst nach Anmeldung im persönlichen Patientenportal angezeigt.",
    kind: "explanation",
    answerScope: "Erklärt die geschützte Zustellung.",
  },
  {
    id: "payment.banking-qr",
    title: "Banking-QR verwenden",
    categories: ["payment_method"],
    keywords: ["banking qr", "scannen", "banking app", "qr code"],
    content: "Der Banking-QR wird im geschützten Rechnungs- oder Zahlungsbereich geöffnet und mit einer geeigneten Banking-App gescannt. Vor der Freigabe der Überweisung müssen Empfänger, Betrag und Verwendungszweck in der Banking-App kontrolliert werden.",
    kind: "procedure",
    answerScope: "Erklärt den technischen Zahlungsweg ohne Zahlungsfreigabe zu behaupten.",
  },
  {
    id: "payment.bank-transfer",
    title: "Normale Banküberweisung verwenden",
    categories: ["payment_method"],
    keywords: ["normale überweisung", "banküberweisung", "iban", "verwendungszweck"],
    content: "Alternativ zum Banking-QR kann die Zahlung als normale Banküberweisung erfolgen. Dafür werden ausschließlich die Bankverbindung, der Betrag und der Verwendungszweck aus der bereitgestellten Rechnung übernommen.",
    kind: "procedure",
    answerScope: "Nennt die erforderlichen Rechnungsangaben, aber keine Bankdaten aus Patientennachrichten.",
  },
  {
    id: "payment.due-date",
    title: "Zahlungsfrist finden",
    categories: ["payment_method", "invoice_access"],
    keywords: ["zahlbar bis", "frist", "fällig", "wann zahlen"],
    content: "Die verbindliche Zahlungsfrist steht auf der bereitgestellten Rechnung unter „Zahlbar bis“. Der Support darf keine abweichende Frist erfinden oder zusagen. Fragen zu einer bereits überschrittenen Frist werden persönlich geprüft.",
    kind: "policy",
    answerScope: "Verweist auf die Rechnung und verhindert erfundene Fristen.",
  },
  {
    id: "privacy.no-credentials",
    title: "Zugangsdaten niemals anfordern",
    categories: ["login_password", "portal_setup"],
    keywords: ["passwort senden", "code senden", "zugangsdaten", "sicherheit"],
    content: "Support und Praxis fordern niemals das Passwort oder den sechsstelligen Sicherheitscode per E-Mail, Telefon oder Chat an. Patienten sollen solche Daten ausschließlich in der geöffneten Anima-Cura-Anwendung eingeben.",
    kind: "policy",
    answerScope: "Verbindliche Sicherheitsgrenze für sämtliche Antworten.",
  },
] as const;

function normalized(value: string) {
  return value.toLocaleLowerCase("de-DE");
}

export function retrieveSupportKnowledge(category: SupportKnowledgeCategory, question: string, limit = 4) {
  const text = normalized(question);
  return SUPPORT_KNOWLEDGE
    .filter(entry => entry.categories.includes(category))
    .map(entry => ({
      entry,
      score: 10 + entry.keywords.reduce((score, keyword) => score + (text.includes(normalized(keyword)) ? 2 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit)
    .map(result => result.entry);
}
