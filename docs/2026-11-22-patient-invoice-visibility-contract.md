# Patienten-App · Rechnungen und Dokumente

`GET /api/patient/rechnungen` liefert weiterhin `rechnungen[]`, `sofortrechnungen[]` und `belegeStatus`. Importierte Q1–Q3-Rechnungen bleiben im bisherigen Format. Für Uploads der Praxis und ausgestellte Rechnungen mit eigenem PDF gibt es zusätzlich Zeilen in `rechnungen[]` mit `source: "patient_upload"`.

| Feld | Inhalt |
| --- | --- |
| `patientId`, `id` | Zugeordnetes Kind und Beleg-ID |
| `name`, `documentType` | Bereinigter Name und `rechnung` oder `erste_rechnung` |
| `uploadedAt`, `rechnung_datum` | Zeitpunkt der Ablage. Rechnungsdatum ist bei einem reinen Upload unbekannt |
| `betrag`, `rechnung_nr` | `null` bei einem reinen Upload ohne strukturierte Daten |
| `paymentStatusKnown`, `paymentActionAllowed` | Beide `false` bei einem reinen Beleg ohne zugeordneten offenen Posten |
| `beleg.pdfUrl` | `GET /api/patient/rechnungen/<id>/pdf` mit der bestehenden Patientensitzung |
| `beleg.positionen`, `beleg.begruendungen` | Bei einem reinen PDF-Upload leere Listen. Den PDF-Knopf trotzdem anzeigen |
| `beleg.art`, `beleg.quartal` | Bei einem reinen PDF-Upload `null` |

`belegeStatus: "unavailable"` bezeichnet einen Fehler beim Lesen der strukturierten Rechnungen. `hochgeladeneRechnungenStatus` und `zahlungsdatenStatus` zeigen getrennt, ob Uploads beziehungsweise Zahlungsdaten lesbar waren. Sind Zahlungsdaten nicht verfügbar, können die Belege weiterhin angezeigt werden. Fehlende Beträge bleiben offen. `zahlungsprofil` bleibt für bestehende Aufrufer erhalten. Die Anzeige verwendet es nur bei verfügbaren Zahlungsdaten.

`GET /api/patient/dokumente` behält `dokumente[]`. Einträge mit Typ `rechnung` oder `erste_rechnung`, auch bei historischer Kodierung im Namen, fehlen in dieser Liste bewusst. Ratenzahlungsvereinbarungen, Kostenpläne, Verträge und Bescheinigungen bleiben dort. Für eine leere Liste unter „Rechnungen“ prüft die Ansicht zuerst die Verfügbarkeitsfelder.

Beim Upload über `POST /api/patient/admin/dokumente` wird für `rechnung` und `erste_rechnung` ein PDF verlangt. Die Antwort enthält das bestehende `dokument` und `destination: "rechnungen"`. Die Bestandsanzeige der Praxis kann denselben Upload-Weg weiterverwenden.

Der Knopf einer Rechnungsbenachrichtigung führt zu `/patient/portal?section=rechnungen`. Beim Öffnen die Rechnungsdaten neu laden. Bei einer Störung bleibt der Bereich sichtbar und bietet erneutes Laden an. Bei mehreren Kindern die betroffene Zuordnung anzeigen und nur anhand von `patientId` wechseln.
