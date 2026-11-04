# Retainer-Service, kombinierte Termine und Praxis-Neuerungen

Stand: 4. November 2026

## Fachlicher Stand

- **Retainer ist eine eigenständige Behandlungsart.** Sie setzt weder eine vorherige Behandlung noch einen Behandlungsplan dieser Praxis voraus. Damit kann auch ein neuer oder extern vorbehandelter Patient nur für Reparatur, Wiederbefestigung oder Erneuerung eines Retainers dokumentiert werden.
- **Ein Besuch kann mehrere Terminarten enthalten.** Der Server akzeptiert bis zu 32 unterschiedliche Terminarten in einem Eintrag. Sie werden im Feld `termin_typ` mit `+` verbunden und gemeinsam gegen ihre jeweiligen Vorlagen geprüft.
- **Retainer-Abrechnung wird nicht geraten.** Die neue Vorlage erzeugt keine Gebührenposition. Befund, ausgeführte Maßnahme und Kostenträger müssen fachlich geprüft werden.
- **Neuerungen sind pro Mitarbeiter lesbar.** Die API liefert den persönlichen Lesestand und getrennte Zähler für ungelesene sowie wichtige ungelesene Neuerungen.

## Scribe-Vertrag

`GET /api/doku/vorlagen` liefert zusätzlich zu `vorlagen`:

```ts
type ScribeCapabilities = {
  multipleTerminTypes: true;
  crossPhaseCombination: true;
  maxCombinedTerminTypes: 32;
  oneEntryPerEncounter: true;
};
```

Ein kombinierter Besuch bleibt **ein** Dokumentationseintrag:

```ts
type CombinedEncounter = {
  termin_typ: string; // z. B. "beratung+diagnostik+retainer-service"
  auswahl: Record<string, Record<string, number[]>>; // je Terminart getrennt
};
```

Die Retainer-Vorlage hat `termin_typ: "retainer-service"` und fragt verpflichtend ab:

- Herkunft der Vorbehandlung: eigene Praxis, andere Praxis oder unbekannt
- Kiefer: OK, UK oder beide
- Befund: gelöst, gebrochen, verloren, beschädigt/nicht passend oder neuer Retainer gewünscht
- heutige Maßnahme: wieder befestigt, repariert, entfernt, neu beauftragt, Scan, Abformung oder nur Beratung
- optional: Labor, Kontrolltermin und Verfügbarkeit von Unterlagen der Vorpraxis

## API für die Benachrichtigungszentrale

### `GET /api/praxis-updates`

Parameter:

- `lang=de|en`, Standard `de`
- `ungelesen=1`, optional
- `limit=1..100`, Standard `50`

Antwort:

```ts
type PracticeUpdatesResponse = {
  updates: Array<{
    id: string;
    slug: string;
    category: "neuerung" | "wichtig" | "hinweis";
    title: string;
    summary: string;
    body: string;
    publishedAt: string;
    requiresAcknowledgement: boolean;
    firstSeenAt: string | null;
    readAt: string | null;
    acknowledgedAt: string | null;
    unread: boolean;
  }>;
  unreadCount: number;
  importantUnreadCount: number;
};
```

Zugriff: Praxisleitung, Verwaltung und Lesezugriff. Patienten erhalten keine Praxis-Neuerungen.

### `POST /api/praxis-updates/[id]/status`

```ts
type Body = { action: "read" | "acknowledge" };
type Response = { status: { readAt: string; acknowledgedAt: string | null } };
```

Der Status gehört immer zum eingeloggten Mitarbeiter. `acknowledge` setzt zugleich den Lesestand.

### `POST /api/praxis-updates`

Nur Praxisleitung. Alle sichtbaren Texte sind zweisprachig erforderlich.

```ts
type CreatePracticeUpdate = {
  slug: string;
  category?: "neuerung" | "wichtig" | "hinweis";
  title: { de: string; en: string };
  summary: { de: string; en: string };
  body: { de: string; en: string };
  requiresAcknowledgement?: boolean;
  audienceRoles?: Array<"admin" | "verwaltung" | "lesezugriff">;
  visibleFrom?: string | null;
  visibleUntil?: string | null;
  publish?: boolean;
};
```

## Übergabe an Claude: reine Oberfläche

Bitte ausschließlich die sichtbare Oberfläche bauen; Serververtrag und Datenbank stehen bereit.

1. In Anima Scribe dürfen Terminarten aus verschiedenen Abschnitten gleichzeitig ausgewählt werden. Eine neue Auswahl darf die bestehende Auswahl nicht ersetzen. Zeige die Auswahl als klar benannte Chips und eine verständliche Aktion „Weitere Terminart hinzufügen“.
2. Zeige „Retainer reparieren oder erneuern“ als gut auffindbare eigenständige Behandlungsart. Der Text muss klar sagen: auch für neue Patienten und Vorbehandlung in einer anderen Praxis.
3. Verwende `capabilities.crossPhaseCombination` aus `/api/doku/vorlagen`; keine eigene Oberflächenannahme über erlaubte Kombinationen.
4. Baue in die bestehende Kopfzeile eine unaufdringliche Glocke mit `unreadCount`. Bei `importantUnreadCount > 0` soll sie deutlich aufleuchten und „Es gibt eine wichtige Neuerung“ ankündigen.
5. Beim Öffnen erscheint eine einfache Liste mit Titel, Kurzbeschreibung und Datum. Der vollständige Text darf aufklappen. Beim Öffnen `read` senden; bei erforderlicher Bestätigung einen eindeutigen Button „Gelesen und verstanden“ verwenden.
6. Keine Fach- oder Technikbegriffe. Sabine und das Praxisteam sollen in einem Blick verstehen, was neu ist und was sie tun müssen.

Keine Navigation, Anmeldung oder bestehende Fachlogik ändern.
