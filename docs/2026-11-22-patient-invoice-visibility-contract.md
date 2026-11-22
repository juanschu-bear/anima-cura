# Patienten-App · Rechnungen und Dokumente

`GET /api/patient/rechnungen` liefert weiterhin `rechnungen[]`, `sofortrechnungen[]` und `belegeStatus`. Importierte Q1–Q3-Rechnungen bleiben im bisherigen Format. Für Uploads der Praxis und ausgestellte Rechnungen mit eigenem PDF gibt es zusätzlich Zeilen in `rechnungen[]` mit `source: "patient_upload"`.

| Feld | Inhalt |
| --- | --- |
| `patientId`, `id` | Zugeordnetes Kind und Beleg-ID |
| `name`, `documentType` | Bereinigter Name und `rechnung` oder `erste_rechnung` |
| `uploadedAt`, `rechnung_datum` | Zeitpunkt der Ablage. Rechnungsdatum ist bei einem reinen Upload unbekannt |
| `betrag`, `rechnung_nr` | `null` bei einem reinen Upload ohne strukturierte Daten |
| `paymentStatusKnown`, `paymentActionAllowed` | Beide `false` bei einem reinen Beleg ohne zugeordneten offenen Posten |
| `beleg.pdfUrl` | `GET /api/patient/rechnungen/<id>/pdf?source=upload` mit der bestehenden Patientensitzung |
| `beleg.positionen`, `beleg.begruendungen` | Bei einem reinen PDF-Upload leere Listen. Den PDF-Knopf trotzdem anzeigen |
| `beleg.art`, `beleg.quartal` | Bei einem reinen PDF-Upload `null` |

`belegeStatus: "unavailable"` bezeichnet einen Fehler beim Lesen der strukturierten Rechnungen. `hochgeladeneRechnungenStatus` und `zahlungsdatenStatus` zeigen getrennt, ob Uploads beziehungsweise Zahlungsdaten lesbar waren. Sind Zahlungsdaten nicht verfügbar, können die Belege weiterhin angezeigt werden. Fehlende Beträge bleiben offen. `zahlungsprofil` bleibt für bestehende Aufrufer erhalten. Die Anzeige verwendet es nur bei verfügbaren Zahlungsdaten.

`GET /api/patient/dokumente` behält `dokumente[]`. Einträge mit Typ `rechnung` oder `erste_rechnung`, auch bei historischer Kodierung im Namen, fehlen in dieser Liste bewusst. Ratenzahlungsvereinbarungen, Kostenpläne, Verträge und Bescheinigungen bleiben dort. Für eine leere Liste unter „Rechnungen“ prüft die Ansicht zuerst die Verfügbarkeitsfelder.

Beim Upload über `POST /api/patient/admin/dokumente` wird für `rechnung` und `erste_rechnung` ein PDF verlangt. Die Antwort enthält das bestehende `dokument` und `destination: "rechnungen"`. Die Bestandsanzeige der Praxis kann denselben Upload-Weg weiterverwenden.

Der Knopf einer Rechnungsbenachrichtigung führt zu `/patient/portal?section=rechnungen`. Beim Öffnen die Rechnungsdaten neu laden. Bei einer Störung bleibt der Bereich sichtbar und bietet erneutes Laden an. Bei mehreren Kindern die betroffene Zuordnung anzeigen und nur anhand von `patientId` wechseln.

## Ergänzung Codex: Fehlerstatus und historische PDFs

Eingespielt laut Juan/Claude: `099_invoice_portal_visibility.sql`, SHA-256 `29383f2239d97b213cd81058e81101ae4fd7c1a082fe1e6276167597d7c54491`. Gemeinsame JWT-Identität, Patientengeltungsbereich, PDF-Auswahl und Versand-Vorprüfung. Noch vorzulegen/einzuspielen: `100_invoice_portal_function_audit.sql` zieht die exakten Fingerabdrücke aus 098/099 im Audit 082 nach und repariert die von 099 nicht ersetzte alte `patient_invoice_documents()`. Keine zusätzlichen Rechte auf `auth`.

Bereits veröffentlicht: `source=patient_upload`, `hochgeladeneRechnungenStatus`, `zahlungsdatenStatus`, Typfilterung und historische Uploads (`86b90f1`; erfolgreiches Production-Deployment `21fddad` bestätigt). Die folgenden neuen Verfügbarkeits-/Health-Felder stammen aus diesem Auftrag; ihre Bereitstellung ist getrennt zu prüfen.

`GET /api/patient/rechnungen` ergänzt `belegVerfuegbarkeit`:

```json
{
  "status": "unavailable",
  "code": "invoice_source_unavailable",
  "editionsStatus": "unavailable",
  "retryable": true,
  "checkedAt": "2026-11-22T07:00:00.000Z"
}
```

`status` und `editionsStatus` sind jeweils `available | unavailable`. Bei verfügbarem Hauptbestand ist `code: null`, `retryable: false`. `belegeStatus` bleibt als kompatibles Feld erhalten. Fehler beim Lesen der Mitgliedschaften machen den Hauptbestand ebenfalls `unavailable`, damit eine unvollständige Familienliste nicht als vollständig erscheint. Ein Fehler der Editionen verhindert die Anzeige vorhandener Originale nicht. Die Upload-, Zahlungs- und Sofortrechnungsstatus bleiben separat. Keine bestehenden Felder entfallen.

Claude: Bei `belegeStatus=unavailable` „Belege gerade nicht verfügbar“ mit erneutem Laden anzeigen, niemals „Keine Rechnungen“. Bereits lesbare Teilbestände dürfen sichtbar bleiben. HTTP 503 mit `code=invoice_source_unavailable` beim PDF bedeutet eine technische Störung. HTTP 403 mit `patient_invoice_forbidden` bedeutet die ausdrückliche Patientenzugriffssperre. SQLSTATE 42501 allein ist kein Beweis für eine Patientensperre.

Historische private PDFs mit `file_url=/api/patient/dokumente/<id>/datei` werden jetzt ebenfalls als `source=patient_upload` geliefert, bei erkannten veröffentlichten Altbelegen ohne Eintrag in `billing_invoices`; die übrigen privaten Bestandsbelege behalten ihre Prüfung auf ausgestellte Rechnungen. PDF-Ziel für Uploads ist `/api/patient/rechnungen/<id>/pdf?source=upload`. Die Abfrage ist vor dem Storagezugriff auf die Patientenzuordnungen der verifizierten Sitzung beschränkt. Einträge mit derselben ID wie ein importierter Beleg werden nur einmal angeboten; keine unsichere Zusammenführung anhand von Namen oder Beträgen. Die alten Datensätze werden als Belegnachweis erhalten und aus `/api/patient/dokumente` herausgefiltert. Dort keine neuen Felder, nur die bereits vereinbarte Typfilterung.

## Praxiswarnung für den Leitstand

Neue interne Route: `GET /api/patient/internal/invoice-access-health`, geschützt durch `x-invoice-worker-secret` mit dem vorhandenen `INVOICE_ACCESS_WORKER_SECRET`. Nur serverseitig aufrufen; Geheimnis niemals an den Browser weitergeben.

```json
{
  "status": "recent_failure",
  "code": "invoice_source_unavailable",
  "lastFailureAt": "2026-11-22T07:00:00.000Z",
  "checkedAt": "2026-11-22T07:01:00.000Z",
  "windowHours": 24,
  "patientAccessVerified": false
}
```

Der Rechnungslisten-Endpunkt protokolliert technische Ausfälle in `audit_log` als `tabelle=patient_invoice_read`, ohne Patientenkennungen, Rechnungsnummern, Tokens oder rohe Fehlermeldungen. `recent_failure` heißt: in den letzten 24 Stunden hat ein tatsächlicher Listenabruf einen Ausfall festgestellt. Ohne Eintrag lautet der Status `unknown`, nicht „gesund“. Bei fehlender Beobachtbarkeit HTTP 503, `status=unknown`, `code=invoice_monitor_unavailable`. Es handelt sich um ein reaktives Signal, keinen aktiven Patientensitzungstest. Einzelne PDF-Ausfälle werden mit HTTP 503 zurückgegeben, derzeit nicht separat in diesem Aggregat erfasst. Claude baut die sichtbare Warnung und den Leitstand-Aufruf.

## AnimaHost und Abnahme

`recoverPatientInvoice()` schreibt keine Dokumente. Seit 099 liest es `animahost_invoice_portal_visibility`: gemeinsame Kontozuordnung/PDF-Auswahl; Fehler, fehlende oder mehrdeutige Zuordnung führen zu `manual_review`. Der Rollentest vergleicht diese Entscheidung mit dem authentifizierten App-RPC-Weg. Kein SQL-Preflight darf als beobachteter HTTP-/Browserzugriff bezeichnet werden. Die Antwort nennt Patient und „Rechnungen“; bei manueller Prüfung kommt der Team-Rückmeldezeitpunkt dazu.

Dauerhafte lokale/CI-Prüfung: `node scripts/test-patient-invoice-authenticated.mjs`. Live-Abnahme: `INVOICE_SESSION_CASES_FILE=/privater/pfad/cases.json node scripts/verify-patient-invoice-sessions.mjs`. Drei bestehende, autorisierte Sitzungen; Konfiguration und Cookie-Dateien niemals versionieren. Der Test verlangt Einzelzugang, Geschwisterzugang und Mitgliedschaftszugang und ruft die echten App-Routen inklusive aller gelisteten PDFs auf. Er erzeugt keine Nutzer, setzt keine Passwörter zurück und verschickt nichts.

## Bereitstellung bestätigt

`20860ef` ist auf main und laut Vercel erfolgreich in Production bereitgestellt. Damit sind die oben ergänzten Verfügbarkeitsfelder und die interne Health-Route live im veröffentlichten Code. Die vorher bereits veröffentlichten Upload-/Zahlungsstatus bleiben erhalten. Die SQL-Audit-Ergänzung 100 ist davon unabhängig und noch einzuspielen. Der neue PostgreSQL-Test ist auch in GitHub Actions grün; der gesamte Production-Verify-Lauf scheitert derzeit an zwei anderen Live-RPC-Signaturen, siehe Reparaturbericht.

## Ergänzung: Browserabsturz und Rückkehr nach Anmeldung

Die Patientenoberfläche verarbeitet jetzt auch den vollständigen Upload-Vertrag: `beleg.quartal`, `beleg.art` und `betrag` dürfen `null` sein. Sie zeigt den Upload-Namen, „Betrag siehe PDF“ und den PDF-Zugriff ohne erfundene 0-Euro-Beträge oder Krankenkassen-Zuordnung. API-Felder kommen durch diese Korrektur nicht hinzu und entfallen nicht.

Die Ansicht berücksichtigt `belegeStatus`, `hochgeladeneRechnungenStatus` und `zahlungsdatenStatus`; fehlgeschlagene HTTP-/Netzwerk-/JSON-Abrufe zeigen einen Hinweis und erneutes Laden. Verfügbare Teilbestände bleiben sichtbar. `section=rechnungen` übersteht die Anmeldung; das ältere `section=invoices` öffnet ebenfalls „Rechnungen“. `section=documents` öffnet weiterhin „Dokumente“.

Dauerhafter Browser-Test: `npm run test:patient-portal-ui` (Chromium). Er prüft die echten React-Komponenten mit synthetischen Antworten, einschließlich PDF-Link, Nullwerten, wiederhergestelltem Tab, Ausfällen/Retry, Login-Ausnahmen und Rückweg von der Fehlerseite. Er ersetzt keine Prüfung einer echten Patientensitzung gegen Production. GitHub Actions führt ihn bei jedem Push auf main aus. Die Veröffentlichung dieser Ergänzung ist am zugehörigen Commit/Deployment zu prüfen.
