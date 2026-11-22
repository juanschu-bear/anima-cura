# Rechnungsbestand und Nachfassen – Produktionsstand 22.11.2026

Quelle: Juans Rückmeldung zur lesenden Produktionsprüfung durch Claude nach Installation von 030 und 031. Beide Migrationen liefern „eingespielt“, Prüfsummen unverändert. Keine Patientennamen in diesem Bericht.

| Kennzahl | Bestätigter Stand |
|---|---:|
| Eindeutige Rechnungen Q1–Q3 2026 | 2.272 |
| Zugeteilt und sichtbar | 2.271 |
| Patienten mit sichtbaren Rechnungen | 1.008 |
| Ohne Zuordnung | 1 (`patient_number_not_found`) |
| Ungültige PDFs | 0 |
| Rechnungen mit Versandnachweis | 1.946 |
| Personen dieser Versandmenge | 827 |
| Sichtbare Rechnungen ohne Versandnachweis | 325 |
| Personen dieser Restmenge | 181 |

Die frühere Bestandszahl 2.080 ist korrigiert. 1.946 + 325 + 1 = 2.272. Die Personengruppen nicht ohne gesonderten Nachweis als disjunkt darstellen. Der mitgeteilte Einzelprüffall bestätigt Q3, 12 Positionen, ein gültiges PDF und den richtigen Patienten. Der Vergleich mit dem Betrag der Kurzfassung ist damit noch nicht nachgewiesen.

## Versanddifferenz

Die frühere Zahl 1.947 liegt um eins über den aktuell bestätigten 1.946. Die Ursache ist offen. `docs/2026-11-22-invoice-reconciliation-readonly.sql` vergleicht je Runde Payload-Einträge, eindeutige Dokument-IDs, Rechnungsnummern, tatsächliche Mailannahmen und aktuell sichtbare Belege. Sie gibt die konkreten abweichenden Referenzen und Gründe aus. Weder „Doppelung“ noch „nicht versandt“ oder „inaktiv“ darf vor diesem Ergebnis als Ursache behauptet werden.

## Eine offene Zuordnung

Die ergänzende Abfrage liefert Import-/Beleg-ID, aktuelle Revision, Kandidaten-ID und getrennte Nachweise für Patientennummer, Geburtsdatum und vollständigen Namen, ohne diese persönlichen Merkmale auszugeben. Eine Kandidatenliste ist noch keine Zuordnung. Erst nach belegter Identität den vorhandenen auditierten Befehl `invoice.review` mit aktueller Revision, Zielpatient und Begründung verwenden. Keine fremde Rechnungsnummer, Summenähnlichkeit oder Namensähnlichkeit als alleinige Grundlage; keine Ersatzperson anlegen. Danach Sichtbarkeit und PDF sowie die neue Gesamtzählung prüfen. Die konkrete Zuordnung wurde hier noch nicht ausgeführt.

## Aufnahme der 325 in den Worker

Gefundene Ursache: Der bisherige Nachfassplaner startete ausschließlich aus tatsächlich verschickten Mails. Rechnungen ohne Erstversand wurden nie aufgenommen. Der Code ergänzt jetzt eine einmalige Erstzustellaufnahme für alle freigegebenen Q1–Q3-Belege ohne Versandnachweis. Bereits bestehende Versandaufträge werden berücksichtigt. Derselbe Vorprüfungs- und Stoppweg gilt vor Versand. Kein erfundener früherer Mailzeitpunkt: Der 72-Stunden-Rhythmus startet erst nach tatsächlicher Annahme der Erstmail.

Nachgewiesen im lokalen Datenbanktest: 325 synthetische Rechnungen / 181 Personen werden einmalig aufgenommen; ein zweiter Lauf legt keinen Doppelauftrag an. Tests für Versand, PDF-Prüffehler und Stopp bei Öffnung/Zahlung/Abmeldung/manuellem Stopp bestehen. Das ist ein Code-Nachweis, noch kein Nachweis über 325 angelegte Produktionsaufträge.

Produktionsabnahme: Der nächste tägliche Worker meldet `followupPlanning.initial` mit Kandidaten, neu geplanten und bereits erfassten Aufträgen. Die lesende Abfrage schlüsselt jede aktuell noch unbenachrichtigte Rechnung nach Auftrag/Prüfgrund/Stopp auf. Keine unerklärten `not_in_worker`-Fälle dürfen übrig bleiben. Versandannahme, Prüfbedarf und Stopp getrennt berichten. Die eine nachträglich korrekt zugeordnete Rechnung wird anschließend ebenfalls automatisch erfasst, sofern noch kein Versandnachweis besteht.
