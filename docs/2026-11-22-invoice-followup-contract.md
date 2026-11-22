# Rechnungen nachfassen – Vertrag für Claude, 22.11.2026

Juans Entscheidung: Rechnungsmail auch ohne Konto; alle drei Tage je bereits benachrichtigtem Beleg nachfassen, bis Rechnung geöffnet, PDF abgerufen, bezahlt, abbestellt, dauerhaft unzustellbar oder durch die Praxis gestoppt. Keine Höchstzahl. Keine neue Praxisoberfläche in diesem Commit; Claude baut sie gegen diesen Vertrag.

## Freigabe an Claude

**Juan hat am 22.11.2026 ausdrücklich „Für Claude zum Einspielen freigeben“ bestätigt.** Die Freigabe gilt ausschließlich für `030_invoice_followup.sql`, SHA-256 `52d169294204dd01a5bb01bee82d7b1d0e1ecdf32243f371508686861c93466a`, im Projekt `zymqxzhjbcxzhzvjqvbv`, Laufname `2026-11-22-invoice-followup-030`. Code und Deployments beider Repos sind erfolgreich; Cura Production Verify für `4a1e17a` ist grün. Leitstand enthält zusätzlich die Absicherung abgebrochener Worker in `81f76a4`.

**Auftrag an Claude:** Datei unverändert über Juans bestehende Supabase-Sitzung einspielen, Ergebniszeile protokollieren und anschließend die unten beschriebene Produktionsabnahme durchführen. Die Installation wurde von Codex nicht ausgeführt. Freigabe ist kein Nachweis einer Installation. Zählungen ohne Namen zurückgeben: übernommene historische Serien, aktuell fällige Serien, Versandannahmen, Abschlüsse nach Grund, Prüffälle nach Grund, Anrufliste und dauerhafte Rückläufer. Keine weitere Codefreigabe erforderlich. Der nächste Worker kann nach Installation innerhalb des Tagesfensters echte Erinnerungen senden.

## Bereitstellung und Aktivierung

- Patienten-App: Erfassung der tatsächlichen Belegöffnung, PDF-Abrufe, App-Installation; interne Vorprüfung und Zugangs-/Abbestelllinks.
- Leitstand: Planung, Versand im vorhandenen Worker, Praxisdaten und auditierter Stoppbefehl.
- **Die neue SQL-Datei ist vorbereitet, hier nicht in Production eingespielt. Code-Deployment und Juans SQL-Freigabe liegen jetzt vor; die Ausführung durch Claude und die Produktionsabnahme stehen noch aus.** Vor der Migration plant der Worker keine Erinnerungen. Fehlende neue Tabellen blockieren bestehende PDFs nicht; die Browserwarteschlange hält echte Öffnungsereignisse für einen erneuten Versuch zurück.
- Migration: `database/abrechnung/030_invoice_followup.sql` im Repo `anima-leitstand`.
- Ziel: **Anima Cura**, Projekt **zymqxzhjbcxzhzvjqvbv**.
- Laufname: **2026-11-22-invoice-followup-030**.
- SHA-256: **52d169294204dd01a5bb01bee82d7b1d0e1ecdf32243f371508686861c93466a**.
- Voraussetzungen: installierter Rechnungszugriff 099 und gültiger Funktionsaudit 100/101; bestehende Worker-Variablen, insbesondere `INVOICE_ACCESS_WORKER_SECRET`, sowie Mailversandkonfiguration. Optionale interne URL: `PATIENT_INVOICE_FOLLOWUP_URL`; Standard ist die neue Route auf animacura.io. Keine neuen Schlüssel nötig.
- Die Migration prüft Projektmerkmale und Rollenrechte, aktualisiert `definition_md5` des geänderten Preflight-RPC im vorhandenen Audit und liefert eine Zeile `030_invoice_followup.sql | eingespielt`. Wiederholung bricht erkennbar ab, ohne Nachfassdaten zu überschreiben.
- **Nach der Migration kann der nächste bestehende Cron-Lauf bereits überfällige Erinnerungen verschicken.** Dieser Aktivierungsschritt ist keine reine Datenanlage.

## Rhythmus und Belegidentität

Der vorhandene Cron `/api/abrechnung/notifications/dispatch` läuft alle fünf Minuten und übernimmt die tägliche Verarbeitung. Er berücksichtigt ausschließlich 09:00 einschließlich bis 19:00 ausschließlich in `Europe/Berlin`, auch an Wochenenden und mit Sommerzeit. Die drei Tage sind 72 verstrichene Stunden ab Annahme der letzten Mail; außerhalb des Fensters wird auf das nächste 09:00 geschoben. Auch der Transport prüft vor einem erneuten Versuch die Tageszeit.

Alle vorhandenen Cura-Mailrunden mit belegten Dokument-IDs und `sent_at` sowie alle Modulrunden mit protokollierter Mailannahme fließen ein. Eine bloß geplante oder ungewiss versandte Mail wird nicht als versandt erfunden. Pro `(patientId, documentId)` gibt es eine Serie. Mehrere Runden zum selben Dokument verschieben deren Beginn auf die letzte angenommene Mail. Bei Rückstand wird beim nächsten verfügbaren Worker-Durchlauf gesendet; der Worker arbeitet in begrenzten Stapeln. Kein rückwirkendes Auffüllen aller versäumten Drei-Tage-Termine: nach der ersten Erinnerung beginnt erneut die 72-Stunden-Frist.

Unterschiedliche Dokument-IDs werden nicht anhand von Namen, Beträgen oder Quartalen zusammengeführt. Bei historischen Uploads ohne belegte Identität zu einem Import bleibt die Zuordnung offen. Ein Rechnungsaufruf eines Kindes beendet keine Erinnerung für dessen Geschwister.

## Vorprüfung und Inhalte

`public.invoice_portal_delivery_preflight(jsonb)` kontrolliert aktive importierte Belege und nutzbare PDF-Bytes jetzt **vor** der Entscheidung `no_account`. Die eingeschränkte Rolle erhält weiterhin kein `USAGE` auf `auth` und keine Schreibrechte auf öffentliche Patiententabellen. Für echte Uploads wird über die geschützte Cura-Route derselbe autorisierte Upload-PDF-Lader wie in der Patienten-App ausgeführt. Ein inaktiver importierter Beleg darf niemals über eine Upload-Kopie wieder freigegeben werden.

- `no_account`: mailfähig nach Beleg-/PDF-Prüfung; persönlicher Zugangslink, kein App-Konto wird vorab angelegt.
- `ambiguous_account`, `account_scope_mismatch`, `invalid_email`, `pdf_unavailable`, `document_inactive`: keine Mail; als Prüffall sichtbar. Technische Ausfälle bleiben ebenfalls sichtbar und werden später erneut geprüft.
- Konto vorhanden: zusätzlich App-Hinweis und Push über den bestehenden Versandweg. Bei Familienkonten bindet der Worker den App-Hinweis an die konkrete geprüfte `accountId`; Cura prüft Profil und Mitgliedschaften erneut und legt den Hinweis beim Hauptpatienten des Eltern-Logins ab. Dessen Geräteabonnement erhält die Push-Nachricht, auch wenn nur die Rechnung eines Geschwisters betroffen ist. Der Text nennt weiterhin das betreffende Kind. Push setzt ein vorhandenes, erlaubtes Geräteabonnement voraus. Sein Fehlschlag macht eine angenommene Mail nicht erneut versandfähig.
- Noch kein beobachteter Login: persönliche Zugangsmöglichkeit in der Mail, auch wenn bereits ein Konto angelegt wurde.
- Letzte Mail nicht geöffnet: vollständigen Hinweis wiederholen. Mail geöffnet und Login vorhanden: kurzer direkter Weg zu „Rechnungen“.
- Mailöffnung, Login, App-Installation und ein Besuch des Rechnungsbereichs beenden die Serie **nie**.

Unmittelbar vor jeder Erinnerung werden Konto, Zuordnung und PDF erneut geprüft. Nach Linkerstellung werden Öffnung, Zahlung und Abbestellung noch einmal gelesen. Ungewisser Transportausgang bleibt zur Prüfung gesperrt; kein automatischer Doppelversand. Ratenbegrenzung ohne Mailannahme darf erneut versucht werden.

## GET `/api/abrechnung/notifications/followups`

Bestehende Praxissitzung mit Modulrecht `rechnungen` mindestens `lesen`. Antwort `Cache-Control: private, no-store`. Keine Personendaten ohne Anmeldung. Ohne Migration: HTTP 503, `code: notification_followup_not_configured`.

```ts
type Signals = {
  mailOpenedAt: string | null;       // Öffnung der letzten Mail, kann ein Scanner sein
  loggedInAt: string | null;         // letzte Auth-Anmeldung eines zugeordneten Kontos
  appInstalledAt: string | null;    // erstmals nachgewiesen: Installation/Standalone-Nutzung
  invoiceOpenedAt: string | null;   // tatsächliches Aufklappen dieses strukturierten Belegs
  pdfRetrievedAt: string | null;    // autorisiert ausgelieferte, validierte PDF-Bytes
  paidAt: string | null;            // gebuchter Zeitpunkt, sonst Zeitpunkt der Feststellung
  paymentStatusKnown: boolean;      // eindeutige Zuordnung zum Zahlungsposten vorhanden
  unsubscribedAt: string | null;
  hardBouncedAt: string | null;
};
type Invoice = {
  documentId: string;
  revision: number;
  signals: Signals;
  signalsCheckedAt: string;
  reminderCount: number;
  lastMailAt: string;
  lastReminderAt: string | null;
  nextReminderAt: string | null;
  stopReason: 'invoice_opened' | 'pdf_retrieved' | 'paid' | 'unsubscribed'
    | 'hard_bounce' | 'manual_stop' | null;
  stoppedAt: string | null;
  manualReason: string | null;
  manualStoppedAt: string | null;
  stoppedBy: string | null;
  reviewReason: string | null;
};
type Person = {
  patientId: string; firstName: string; lastName: string;
  invoices: Invoice[];
  signals: Pick<Signals, 'mailOpenedAt' | 'loggedInAt' | 'appInstalledAt'
    | 'invoiceOpenedAt' | 'pdfRetrievedAt'>;
  signalsCheckedAt: string;
  reminderCount: number;
  lastReminderAt: string | null;
  nextReminderAt: string | null;
  state: 'active' | 'review' | 'closed' | 'stopped';
  stopReasons: NonNullable<Invoice['stopReason']>[];
  manualStop: {reason: string; actorId: string; at: string} | null;
  callRequired: boolean;
};
type Response = {
  contractVersion: 'invoice-followup-v1';
  asOf: string;
  people: Person[];
  callList: string[]; // patientId, aus people auflösen
  practiceTasks: {patientId: string; documentId: string;
    kind: 'call' | 'hard_bounce'; createdAt: string}[];
};
```

Zeitangaben sind ISO-8601 in UTC; die Oberfläche zeigt Berlin. `null` bedeutet „nicht nachgewiesen“, niemals „sicher nicht passiert“. `asOf` ist die Abfragezeit. `signalsCheckedAt` ist der Stand der letzten Worker-Prüfung, bei Personen der älteste ihrer Belegstände. Die Übersicht ist ein gespeicherter Arbeitsstand; vor dem Versand werden Quellen erneut gelesen. Eine geschlossene Serie bleibt geschlossen; ihre Abschlusssignale werden nicht als fortlaufender Aktivitätstracker aktualisiert.

Die Personensignale zeigen je Signal den neuesten Zeitpunkt ihrer Rechnungen. `reminderCount` summiert tatsächlich angenommene Erinnerungsmails über alle Rechnungen dieser Person; Rundenschreiben zählen nicht mit. `nextReminderAt` ist das früheste geplante Datum einer aktiven, nicht blockierten Serie, kein Versandversprechen. Bei Prüffällen ist es `null`, auch wenn der Worker die Vorprüfung später wiederholt.

Ab der **vierten tatsächlich angenommenen Erinnerung für die Person**, über deren Rechnungen summiert, ist `callRequired=true`, solange mindestens eine Serie offen ist. Weitere Erinnerungen laufen weiter. Bei Abschluss aller Serien oder manuellem Stopp verschwindet die Person aus `callList`. Dauerhafter Bounce erzeugt eine offene `hard_bounce`-Aufgabe; sie bleibt zur Adressklärung erhalten. `email_suppressed` ohne nachgewiesenen Hard Bounce oder Beschwerde ist ein Prüffall, keine erfundene Abbestellung.

Zahlungsstopp verlangt eine eindeutige Verknüpfung zum eigenen offenen Posten: native `billing_invoices.open_item_id` oder exakter normalisierter Rechnungsbezug eines aktiven Importbelegs. Bei historischen reinen Uploads ohne diese Bindung ist `paymentStatusKnown=false`; Zahlung kann dort nicht automatisch behauptet werden. Die Praxis kann den dokumentierten Stoppbefehl verwenden. Eine spätere eindeutige Zahlungszuordnung wird bei der nächsten Prüfung berücksichtigt.

## Patientenweiter Stoppbefehl

`POST /api/abrechnung/notifications`, gleiche Sitzung, gleicher Origin, Modulrecht `schreiben`:

```json
{
  "type": "invoice-followup.stop",
  "commandId": "00000000-0000-4000-8000-000000000901",
  "patientId": "00000000-0000-4000-8000-000000000001",
  "reason": "Rückmeldung telefonisch vereinbart"
}
```

Antwort: `{patientId, stoppedAt, reason, actorId}`. IDs im Beispiel sind synthetisch. Begründung nach Trimmen 3–1000 Zeichen. Derselbe Befehl ist idempotent; Wiederverwendung der ID mit anderem Inhalt oder anderem Akteur wird abgelehnt. Der erste Stopp bleibt unveränderlich und gilt auch für künftig angelegte Nachfassserien dieser Person. Noch nicht versandte Erinnerungen werden gestoppt; eine Mail, die bereits im Transport angenommen wurde, lässt sich nicht zurückholen. Erst nach erfolgreicher Antwort Stopp anzeigen.

Audit: `notification_commands`, `invoice_followup_stops`, `invoice_followup_events` und die Ereignisse betroffener Versandaufträge speichern Akteur, Zeit, Begründung und Befehls-ID. Kein Löschen der Historie, keine Änderung an Rechnungen oder Zahlungen. Ein erneuter abweichender Stopp dokumentiert auch die neu angefragte Begründung, ohne den ersten Eintrag umzuschreiben.

## Patienten-App und Abbestellung

Neue POST-Route `/api/patient/rechnungen/event`: `{event:"invoice_opened",documentId}` oder `{event:"app_installed"}`. Sie prüft die Patientensitzung und übernimmt den tatsächlichen Rechnungszugriffsweg einschließlich Familienfreigaben. Browserereignisse werden bei Netzfehlern erneut übertragen. Ein leeres Upload-Detail ohne Rechnungsinhalt zählt nicht als Öffnung; dort zählt erst der PDF-Abruf. Der PDF-Server schreibt das Signal nur nach erfolgreicher Autorisierung und PDF-Prüfung.

`GET /patient/invoice-emails?token=…&lang=…` zeigt nur eine Bestätigung. Erst POST bestellt ab, damit Mailscanner keinen Stopp auslösen. Mail enthält zusätzlich `List-Unsubscribe` und `List-Unsubscribe-Post`. Der gespeicherte Token ist gehasht. Abbestellung und nachgewiesener Hard Bounce gelten für die Mailadresse und damit alle darunter laufenden Serien; der Praxisbefehl gilt dagegen genau für die Person. Persönliche Links und Token nicht in Oberflächenlogs oder Telemetrie ausgeben.

`GET /api/patient/rechnungen` und `/api/patient/dokumente` erhalten durch dieses Feature keine neuen Felder und verlieren keine. Der vorhandene Vertrag zu `source: "patient_upload"`, `hochgeladeneRechnungenStatus`, `zahlungsdatenStatus` bleibt unverändert. Rechnungen bleiben ausschließlich im Bereich „Rechnungen“.

## Abnahme nach freigegebener SQL-Installation

1. Ergebniszeile und Prüfsumme protokollieren; bestehender Funktionsaudit ohne Verletzungen, `abrechnung_runtime` ohne Auth-Schema- oder öffentliche Schreibrechte.
2. Mit Testadressen getrennt prüfen: ohne Konto mit gültigem persönlichen Link; Einzelkonto; Familienkonto mit Geschwistern; Zugang über Mitgliedschaft. Jede Vorprüfung muss die konkrete Rechnung und das PDF bestätigen.
3. Öffnung von Mail, App und Login lässt Serie offen; Öffnung des konkreten Belegs bzw. PDF beendet nur diese Serie. Bezahlte eindeutig verknüpfte Rechnung, Abbestellung, Hard Bounce und Praxisstopp verhindern weitere Mail.
4. Viertes akzeptiertes Nachfassen setzt Anrufliste; Webhook-Bounce erzeugt Praxisaufgabe. Keine Testmails an echte Patienten ohne entsprechenden Auftrag.
5. Erster produktiver Worker-Lauf: Zählungen für historische Serien, fällige Erinnerungen, Abschlüsse und Prüffälle melden, ohne Patientennamen. Code, Tests, Bereitstellung und Praxisabnahme separat berichten.

## Lokale Prüfung dieses Lieferstands

Beide Production-Builds und Typprüfungen bestanden. Leitstand: vollständige Suite mit 458 erfolgreichen Tests; nach den abschließenden Änderungen erneut 18 gezielte Rechnungs-/Vorprüfungstests. Cura: vollständige Suite mit 490 erfolgreichen Tests, danach 112 Abrechnungstests einschließlich Familienhinweisen; 13 Browserfälle bestanden. Der lesende Live-RPC-Audit bestätigte 68 Aufrufstellen ohne Verletzung. SQL-Migration, Rollenrechte, historische Übernahme, Wiederholungen, parallele Stoppsignale, No-Account-Mail, Berliner Zeitfenster, Zahlung, Abbestellung, dauerhafte Rückläufer und verspätete Providerereignisse wurden in einer lokalen PostgreSQL-Engine geprüft. Dabei wurden keine Patientenmails versandt. Diese Prüfungen ersetzen nicht die Abnahme nach der freigegebenen Production-Migration.
