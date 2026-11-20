# AnimaHost: Selbstservice per WhatsApp

Stand 20.11.2026. Das Regelbuch bleibt versioniert. Die neuen Antworten folgen der bestehenden Freigabe `ANIMAHOST_ACCEPTANCE_PASSED`.

## Terminvermerk und Schließtage

- Die Antwort von `POST /api/animahost/whatsapp` liefert bei einer Terminmeldung `action: "antworten"` und `disposition: "vermerk"`. AnimaLine sendet die Antwort im bestehenden Chat. In den Leitstand-Listen erscheint der gesendete Vermerk unter **Zur Info**. `GET /api/animaline/chats` enthält `disposition: "vermerk" | null` im Listeneintrag und bei eingehenden Nachrichten im Verlauf. Transportfehler bleiben Klärfälle.
- Absage und Verspätung über 15 Minuten am selben Kalendertag in `Europe/Berlin` erscheinen in `practice_notifications` als `wichtig`. Für Verschieben, verpasste Termine und andere Tage gilt `antwort`. Die Versandentscheidung und Meldung sind anhand von Mandant und Nachrichten-ID wiederholbar. Der Terminbestand wird durch einen Vermerk nicht geändert.
- `{doctolib_link}` kann in jedem `patientText` stehen. Der Server ersetzt den Platzhalter durch die HTTPS-Adresse in den Einstellungen. Bei einer fehlenden Adresse wird kein Platzhalter versendet. Für eine neue Terminbuchung gelten die freigegebenen Terminarten. Ein Vermerk über einen bestehenden Termin kann einen Link zum Neubuchen enthalten.
- `GET /api/animahost/control?resource=settings` liefert `settings.closure_periods` nach Migration 091. `POST /api/animahost/control` nimmt bei `action: "update_settings"` das optionale Feld `settings.closurePeriods` als vollständige Liste entgegen. Rollen `admin` und `verwaltung`, bestehende Sitzung. Ein Eintrag ist `{ "from": "2026-12-24", "through": "2027-01-03", "kind": "holiday" }`. Beide Grenzen zählen mit. `kind` ist `closure` oder `holiday`. Ein Tag hat dasselbe Von- und Bis-Datum. Eine leere Liste enthält keine bestätigten Schließtage. Daraus folgt keine Auskunft, die Praxis sei geöffnet.

## Zugangs- oder Rechnungs-Mail erneut senden

AnimaLine liefert zum Eingang optional `identity: { patientId, phone }` aus genau einer von der Praxis bestätigten Zuordnung mit übereinstimmender Telefonnummer. Anima Cura prüft Mandant und Telefonnummer erneut gegen die Akte. Aktivierung, Passwort-Wiederherstellung und Rechnungszugang verwenden die bestehenden Versandwege mit deren Begrenzungen. Die Zieladresse stammt ausschließlich aus der Patientenakte. Pro eingehender Nachricht wird höchstens ein neuer Versand angestoßen. Erst nach Annahme durch den Anbieter bestätigt AnimaHost den Versand im Chat. Unklare Zuordnungen oder unbestätigter Versand gehen an die Praxis. Migration 092 ist Voraussetzung.

## Anwesenheitsbescheinigung für Claude

### PDF-Felder und Ablage

Der PDF-Renderer erhält serverseitig den folgenden Datensatz. Datum und Uhrzeit sind der tatsächliche Besuch in `Europe/Berlin`, die Ausstellungszeit ist ein eigener Wert.

```ts
type AttendanceCertificatePdf = {
  patientName: string;
  serviceDate: string;      // YYYY-MM-DD
  serviceTime: string;      // HH:mm
  issuedAt: string;         // ISO 8601
  locale: 'de' | 'en';
  verificationCode: string; // 24 zufällige Bytes als Base64url, 32 Zeichen
  verificationPageUrl: string;
  artwork: {
    version: string;
    stamp: Uint8Array;
    signature: Uint8Array;
  };
};
```

- Die Praxis stellt den freigegebenen Stempel und die freigegebene Unterschrift als PNG bereit. Beide liegen als private, versionierte Dateien unter `attendance-assets/<tenantId>/<version>/stamp.png` und `signature.png` im privaten Bucket `billing-documents`. Daneben liegen Claudes `certificate-de.pdf` und `certificate-en.pdf`. Die PDF-Vorlagen haben AcroForm-Textfelder `patientName`, `serviceDate`, `serviceTime`, `issuedDate`, `verificationCode`, `verificationUrl` und Bildfelder als PDF-Buttons `practiceStamp`, `practiceSignature`. Der Renderer füllt und fixiert die Felder. `ANIMAHOST_ATTENDANCE_ARTWORK_VERSION` wählt die freigegebene Version. Die Prüfseite erhält weder Bilddateien noch Speicherpfade. Migration 093 hält die verwendete `artwork_version` fest.
- Der fertige Beleg liegt wie die vorhandenen privaten Dokumente unter `<patientId>/<documentId>.pdf` im privaten Bucket `billing-documents`. `patient_documents` verknüpft die Datei mit der richtigen Akte. `typ: "sonstiges"`, Anzeigename „Anwesenheitsbescheinigung“, `file_url: "/api/patient/dokumente/<documentId>/datei"`. Im Chat führt `/patient/portal?document=<documentId>&section=documents` zum geschützten Dokument. Bei fehlender Sitzung führt der App-Einstieg zum Login. Der Prüfcode beschafft keinen Zugriff auf das PDF.
- Ein belegter tatsächlicher Besuch und eine belegte Uhrzeit sind nötig. Maßgeblich sind bestätigte Teile des Tagesdatensatzes, nachgewiesener Check-in im Tagesplan und bestätigte durchgeführte Behandlungsereignisse mit einem belastbaren Zeitbeleg. Eine geplante Uhrzeit allein genügt nicht. Bei fehlender oder mehrdeutiger Uhrzeit geht der Vorgang zur Praxis. Die Herkunft bleibt intern in `evidence: { source, id }`.
- Der automatische Belegablauf braucht den freigegebenen Renderer und die installierte Migration 093. Die folgende Prüfschnittstelle kann Claude unabhängig von der Ausgabe der ersten Bescheinigung anbinden.

### Öffentliche Prüfschnittstelle

`POST /api/patient/attendance-certificate/verify` mit `{ "code": "<32 Zeichen>" }`.

```ts
type VerifyAttendanceCertificate =
  | { valid: true; date: string; time: string }
  | { valid: false };
```

Beide Antworten haben HTTP 200. Unbekannte, widerrufene und falsch formatierte Codes liefern dieselbe Antwort. HTTP 503 `{ "code": "certificate_verification_unavailable" }` steht für einen technischen Ausfall. Die Seite zeigt in diesem Fall „Prüfung momentan nicht verfügbar“. JSON enthält weder Namen noch IDs. Nur der SHA-256-Hash des Codes wird in der Datenbank gespeichert. Die Prüfseite sollte den Code im URL-Fragment oder im Formular übernehmen und ihn ausschließlich im Body an die API senden. Antworten werden nicht zwischengespeichert.

## Rechnungsempfänger und Kontaktdaten

- **Neue Person**: AnimaHost bittet um vollständigen Namen, Straße, Postleitzahl, Ort und E-Mail der neuen Person. `zahler` und `billing_invoice_recipient_versions` halten den Empfänger als `pending`. `billing_payer_versions` führt wie bisher den Kostenanteil. Der neue Empfänger erhält einem Link `https://animacura.io/patient/invoice-recipient/continue#code=<43 Zeichen>` mit 24 Stunden Gültigkeit. Der bloße Aufruf ist lesend. Die Seite bestätigt erst per bewusstem Klick mit `POST /api/patient/invoice-recipient/confirm` und `{code}`. Die API liefert `{confirmed:true}` oder `{confirmed:false}`. Bei einem technischen Ausfall kommt HTTP 503 `invoice_recipient_confirmation_unavailable`. `ANIMAHOST_RECIPIENT_CONFIRM_PAGE_READY=true` erst setzen, wenn diese Seite bereit ist.
- **Bestätigung und Folge**: Die Bestätigung setzt die Version auf `active`. Der nachfolgende lokale Rechnungsentwurf aus Anima Cura übernimmt sie fest in den Rechnungssnapshot. Eine fertige oder bereits reservierte Rechnung behält ihren Empfänger. Der IVORIS-Abgleich übernimmt keine Änderungen an dieser Version. `ivoris_mirror_state: "diverges"` bedeutet „Weicht von IVORIS ab“. Die Praxis erhält eine Info mit Patient und kopierbaren Empfängerdaten. AnimaLine sendet die Bestätigung in den ursprünglichen Chat, wenn dieser weiterhin derselben Akte zugeordnet und für Antworten freigegeben ist. Bei Änderung von Anschrift oder E-Mail derselben Person gilt die Aktualisierung sofort. Ein gemeinsam genutzter alter Zahler wird dabei für andere Kinder nicht geändert.
- **Änderung der Kontaktadresse**: Nach eindeutiger Chatzuordnung werden Anschrift und Telefonnummer in der Patientenakte geändert. Anima Cura speichert Alt- und Neuwert. Eine Änderung mit neuer E-Mail bleibt bis zur Bestätigung im bisherigen App-Konto offen. `ANIMAHOST_CONTACT_CONFIRM_PAGE_READY=true` erst setzen, nachdem Claude die Abfrage `contactChange` in `/patient/portal?contactChange=<id>` angeschlossen hat. `GET /api/patient/contact-changes/<id>` liefert für den berechtigten Patienten `{id,state,proposed}`. `POST` an denselben Pfad bestätigt und liefert `{id,state:"applied"}`. Browser-Sitzung und gleicher Origin sind erforderlich. HTTP 409 bei `contact_change_expired`, `contact_change_stale` oder `contact_email_conflict`. Ein Vorschlag läuft nach 24 Stunden ab. Der Import erhält die bestätigten Kontaktfelder. Andere Stammdaten werden wie bisher synchronisiert.
- **Akte im Leitstand**: `GET /api/animahost/control?resource=case_changes&patientId=<uuid>` für `admin` und `verwaltung` liefert `contactChanges: [{id,state,previous,proposed,created_at,applied_at,confirmed_by}]` und `invoiceRecipients: [{id,state,snapshot,ivoris_mirror_state,created_at,activated_at,expires_at}]`, jeweils maximal 50. `snapshot` enthält `name`, `street`, `postalCode`, `city`, `email`.

Für die Freigabe sind die geprüften Migrationen 091 bis 094, ein erneuter Modelltest mit Regelbuch Version 6 und die oben beschriebenen Seiten und Dateien nötig.

## „Das war ich nicht“ im Patientenportal

`POST /api/patient/contact-changes/<id>` mit JSON `{ "action": "reject" }`, derselben Browser-Sitzung und demselben Origin wie beim Bestätigen. Bei Erfolg kommt HTTP 200 `{ "id": "<id>", "state": "rejected" }`. Wiederholen gibt dieselbe Antwort. Das System protokolliert Zeitpunkt und angemeldetes Konto und legt je Praxisrolle genau eine wichtige Meldung mit Link zur Akte an. Die ablehnende Person sieht keine alten oder neuen Kontaktdaten in dieser Antwort.

- Ein späteres `GET` oder eine Bestätigung desselben Vorschlags liefert HTTP 409 `{ "code": "contact_change_rejected" }`.
- Bereits angewandt: HTTP 409 `{ "code": "contact_change_already_applied" }`. Abgelaufene, unverarbeitete Vorschläge können noch gemeldet werden.
- Unbekannter oder fremder Vorschlag: HTTP 404 `contact_change_not_found`. Ohne Sitzung: HTTP 401 `not_authenticated`. Fremder Origin: HTTP 403 `invalid_origin`. Technischer Fehler: HTTP 503 `contact_change_unavailable`.

Migration 095 schaltet die Ablehnung frei. Aktuelle Grundlage der Modellabnahme ist Regelbuchversion 6 mit 83 Regeln und 17 Regeltexten mit `{doctolib_link}`.

Der Leitstand liest die Meldungen über `GET /api/animahost/control?resource=contact_alerts` als `{ notices: [{ id, kind: "wichtig", title, body, link, createdAt }] }`. Die Sitzung liefert die Praxisrolle. `link` führt zur betroffenen Akte in Anima Cura. Fehler beim Lesen ergeben HTTP 503 `contact_alerts_unavailable`.
