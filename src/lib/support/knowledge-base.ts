export const SUPPORT_KNOWLEDGE_VERSION = "2026-10-14.1";

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
};

export const SUPPORT_CATEGORY_LABELS: Record<SupportKnowledgeCategory, string> = {
  login_password: "Anmeldung und Passwort",
  invoice_access: "Rechnungszugang",
  payment_method: "Zahlungsweg",
  portal_setup: "App und Benachrichtigungen",
};

export const SUPPORT_KNOWLEDGE: readonly SupportKnowledgeEntry[] = [
  {
    id: "access.portal-address",
    title: "Anima-Cura-Anmeldeadresse",
    categories: ["login_password"],
    keywords: ["email", "e-mail", "adresse", "anmeldedaten", "zugangsdaten", "welche adresse"],
    content: "Für die Anmeldung wird die persönliche Anima-Cura-Anmeldeadresse aus der Zugangs-E-Mail verwendet. Sie kann von der normalen Kontakt-E-Mail des Patienten abweichen. Das Passwort oder ein Sicherheitscode darf niemals per E-Mail an den Support geschickt werden.",
  },
  {
    id: "access.password-recovery",
    title: "Passwort selbst zurücksetzen",
    categories: ["login_password"],
    keywords: ["passwort", "vergessen", "falsch", "anmelden", "login", "sicherheitscode", "code"],
    content: "Auf der Anmeldeseite befindet sich unter dem Passwortfeld die Funktion „Passwort vergessen?“. Der Patient gibt dort seine Anima-Cura-Anmeldeadresse ein. Ein sechsstelliger, zehn Minuten gültiger Sicherheitscode wird an die bei der Praxis hinterlegte Kontaktadresse geschickt. Danach wird das neue Passwort zweimal eingegeben und gespeichert.",
  },
  {
    id: "access.return-to-invoice",
    title: "Nach Anmeldung zur Rechnung zurückkehren",
    categories: ["login_password", "invoice_access"],
    keywords: ["rechnung", "zurück", "login", "qr", "button", "link", "weiterleitung"],
    content: "Wurde Anima Cura über den Button oder QR-Code einer Rechnung geöffnet, bleibt dieses Rechnungsziel während Anmeldung und Passwortwechsel erhalten. Nach erfolgreicher Anmeldung öffnet sich wieder der zuvor aufgerufene Rechnungsbereich.",
  },
  {
    id: "portal.install",
    title: "Anima Cura auf dem Smartphone einrichten",
    categories: ["portal_setup"],
    keywords: ["app", "installieren", "einrichten", "smartphone", "handy", "home-bildschirm", "homescreen"],
    content: "Anima Cura wird über den persönlichen Zugangs- oder Rechnungslink im Smartphone-Browser geöffnet. Dort kann das Patientenportal über die Browserfunktion „Zum Home-Bildschirm“ beziehungsweise „Zum Startbildschirm hinzufügen“ wie eine App abgelegt werden. Die Anmeldung erfolgt mit der persönlichen Anima-Cura-Anmeldeadresse.",
  },
  {
    id: "portal.notifications",
    title: "Benachrichtigungen aktivieren",
    categories: ["portal_setup"],
    keywords: ["benachrichtigung", "push", "mitteilung", "erinnerung", "informiert"],
    content: "Benachrichtigungen sollten für Anima Cura zugelassen werden, damit Hinweise auf neue Rechnungen oder wichtige Praxisnachrichten nicht übersehen werden. Wird die Berechtigung nicht angezeigt oder wurde sie abgelehnt, kann sie in den Browser- oder Geräteeinstellungen für Anima Cura erneut aktiviert werden.",
  },
  {
    id: "invoice.find-documents",
    title: "Bereitgestellte Rechnungen finden",
    categories: ["invoice_access"],
    keywords: ["rechnung", "dokument", "finden", "öffnen", "sehen", "abrufen", "app"],
    content: "Bereits digital bereitgestellte Rechnungen sind nach der Anmeldung im geschützten Patientenportal im Bereich „Dokumente“ beziehungsweise „Rechnungen“ verfügbar. Der Rechnungsbutton aus der Benachrichtigungs-E-Mail führt über die Anmeldung zur passenden Rechnung.",
  },
  {
    id: "invoice.protected-link",
    title: "Warum der Rechnungslink zur Anmeldung führt",
    categories: ["invoice_access"],
    keywords: ["warum", "login", "anmeldung", "qr", "direkt", "schutz"],
    content: "Rechnungsdaten sind geschützt. Deshalb kann ein Rechnungsbutton oder QR-Code zunächst die Anmeldeseite zeigen. Nach erfolgreicher Anmeldung wird die zugehörige Rechnung geöffnet. Die E-Mail selbst enthält aus Datenschutzgründen nicht alle Rechnungs- und Zahlungsdaten offen.",
  },
  {
    id: "payment.supported-methods",
    title: "Verfügbare Zahlungswege",
    categories: ["payment_method"],
    keywords: ["zahlen", "zahlung", "überweisung", "banking", "qr", "bank", "zahlungsweg"],
    content: "Im geschützten Rechnungs- oder Zahlungsbereich stehen Banking-QR und normale Banküberweisung zur Verfügung. Beide Zahlungswege sind möglich. Maßgeblich sind Rechnungsbetrag, Verwendungszweck und Zahlungsfrist der bereitgestellten Rechnung.",
  },
  {
    id: "payment.case-escalation",
    title: "Individuelle Zahlungsfragen weitergeben",
    categories: ["payment_method"],
    keywords: ["betrag", "rate", "ratenplan", "bezahlt", "verbucht", "mahnung", "falsch"],
    content: "Fragen zu einem konkreten Betrag, einer bereits geleisteten Zahlung, einem Ratenplan, einer Mahnung oder einer Buchung dürfen nicht automatisch bewertet werden. Diese Fälle müssen persönlich geprüft werden.",
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
