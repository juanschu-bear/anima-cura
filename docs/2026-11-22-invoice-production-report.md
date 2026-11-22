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

**Durch Claudes lesende Produktionsprüfung um 20:50 aufgeklärt:** 1.947 angenommene Mails zu 1.947 unterschiedlichen Dokument-IDs; keine Doppelung und keine abgelehnte Mail. Ein korrekt zugeordneter, sichtbarer BEMA-Beleg liegt mit `fields.quarter = 2025-Q4` außerhalb der Q1–Q3-Zählung. Daher 1.946 innerhalb Q1–Q3, 1.947 verschickte Dokumente insgesamt. Der Quartalsfilter der Akte blendete diesen Beleg fälschlich aus.

Originalprüfung durch Codex: bekannte Quelldatei `BEMA 2Q2026.pdf`, SHA-256 `73edd13a1911635139b381a304da908aa25b303670ea53a75e87f25c2c4738b7`, Seite 508. Referenzfeld und Quartalsspalte enthalten beide `4/2025`, Rechnungsdatum `30.06.2026`. Der IVORIS-Parser übernimmt das Quartal aus der Referenz; das spätere Rechnungsdatum überschreibt es nicht. Das Quartalsfeld wird nicht geändert.

Die gemeinsame Akte umfasst nun alle importierten Startbestandsbelege unabhängig vom Quartalsfeld. 2.272 bleibt die bestätigte Q1–Q3-Teilmenge; diese Zahl nicht als Gesamtsumme aller Quartale beschriften. `coverage.referenceCohort` trennt die bisherige Q1–Q3-Messlatte von der gesamten Akte.

## Eine offene Zuordnung

Die ergänzende Abfrage liefert Import-/Beleg-ID, aktuelle Revision, Kandidaten-ID und getrennte Nachweise für Patientennummer, Geburtsdatum und vollständigen Namen, ohne diese persönlichen Merkmale auszugeben. Eine Kandidatenliste ist noch keine Zuordnung. Erst nach belegter Identität den vorhandenen auditierten Befehl `invoice.review` mit aktueller Revision, Zielpatient und Begründung verwenden. Keine fremde Rechnungsnummer, Summenähnlichkeit oder Namensähnlichkeit als alleinige Grundlage; keine Ersatzperson anlegen. Danach Sichtbarkeit und PDF sowie die neue Gesamtzählung prüfen. Claude meldet genau einen Kandidaten: Patientennummer, Geburtsdatum und Nachname stimmen überein, vollständiger Name nicht. Juan verlangt ausdrücklich seine gesonderte Freigabe vor `invoice.review`. **Nicht ausgeführt; keine Freigabe aus der allgemeinen Reparatur ableiten.** IDs und Namen werden nicht im Repository hinterlegt.

## Aufnahme der 325 in den Worker

Gefundene Ursache: Der bisherige Nachfassplaner startete ausschließlich aus tatsächlich verschickten Mails. Rechnungen ohne Erstversand wurden nie aufgenommen. Der Code ergänzt jetzt eine einmalige Erstzustellaufnahme für alle freigegebenen Q1–Q3-Belege ohne Versandnachweis. Bereits bestehende Versandaufträge werden berücksichtigt. Derselbe Vorprüfungs- und Stoppweg gilt vor Versand. Kein erfundener früherer Mailzeitpunkt: Der 72-Stunden-Rhythmus startet erst nach tatsächlicher Annahme der Erstmail.

Nachgewiesen im lokalen Datenbanktest: 325 synthetische Rechnungen / 181 Personen werden einmalig aufgenommen; ein zweiter Lauf legt keinen Doppelauftrag an. Tests für Versand, PDF-Prüffehler und Stopp bei Öffnung/Zahlung/Abmeldung/manuellem Stopp bestehen. Das ist ein Code-Nachweis, noch kein Nachweis über 325 angelegte Produktionsaufträge.

Produktionsabnahme: Der nächste tägliche Worker meldet `followupPlanning.initial` mit Kandidaten, neu geplanten und bereits erfassten Aufträgen. Die lesende Abfrage schlüsselt jede aktuell noch unbenachrichtigte Rechnung nach Auftrag/Prüfgrund/Stopp auf. Keine unerklärten `not_in_worker`-Fälle dürfen übrig bleiben. Versandannahme, Prüfbedarf und Stopp getrennt berichten. Die eine nachträglich korrekt zugeordnete Rechnung wird anschließend ebenfalls automatisch erfasst, sofern noch kein Versandnachweis besteht.

## Bestätigte Übergabe an Claude

Juan hat am 22.11.2026 bestätigt: „Claude führt den ergänzenden Abgleich aus“. Die ausschließlich lesende Datei liegt in `anima-leitstand/docs/2026-11-22-invoice-reconciliation-readonly.sql` auf `main`. Keine neue Migration und keine erneute Installation von 030/031 erforderlich.

Rückmeldung ohne Patientennamen oder Zugangsdaten:

1. Die konkrete Belegreferenz und der nachgewiesene Grund für die Differenz 1.947/1.946; Payload-Zählung, tatsächlichen Versand und aktuelle Sichtbarkeit getrennt ausweisen.
2. Für die offene Rechnung: `part_id`, `batch_id`, aktuelle `revision`, Kandidaten-ID, `candidate_count` und die drei Identitätsprüfungen. Noch keine Zuordnung allein aus einem Kandidaten ableiten.
3. Nach dem regulären Worker-Lauf: `followupPlanning.initial` und die Gruppierung nach `worker_state`, `initial_delivery`, `reason`, Rechnungs- und Personenzahl. Insbesondere alle `not_in_worker`-Fälle erklären; Versand, Prüfung und Stopp nicht zusammenzählen.

Diese Bestätigung dokumentiert den Auftrag zum Abgleich. Ergebnisse, abgeschlossene Zuordnung und tatsächliche Produktionsaufnahme bleiben bis zur Rückmeldung offen.


## Vorrangige Laufzeitkorrektur nach Meldung 20:50

Der Patientenabruf verwendete eine globale Freigabe-View, deren gemeinsame Teilabfrage PDF-Inhalte mitführt, sowie dreimal die globale Mail-View mit korrelierten Ereignisabfragen und erneutem Beleg-Join. PDF-Abrufe luden zusätzlich erst die gesamte Akte einschließlich Zahlung/Zustellung. Diese Pfade sind ersetzt:

- Kanonische Freigabe anhand derselben Metadatenregeln wie Migration 022, ohne PDF-Inhalte in der globalen Zwischentabelle; Konfliktprüfung weiterhin über alle Besitzer derselben Rechnungsnummer.
- PDF-Kopf nur für ausgewählte Belege; vollständige Bytes nur beim einzelnen PDF-Abruf.
- Patientenzugehörige Versandaufträge vorfiltern, Ereignisse einmal für diese Aufträge lesen; Cura-Mailnachweise einmal lesen. Keine globale `source_invoice_sent_mail` im interaktiven Aktenabruf.
- Eigenständiger PDF-Zugriffsweg prüft dieselben Rechte/Freigaben, lädt aber keine Zahlung oder Versandhistorie.
- Gemeinsames SQL-Zeitbudget statt erneutem vollen Timeout pro Teilabfrage; erfolgreiche Antworten tragen `Server-Timing: invoice_record;dur=…`, auch über die Cura-Route.

Die lokalen Datenbanktests verwenden die tatsächliche Freigabe-View aus 022 als Vergleich, einschließlich Fremdpatient, widersprüchlicher Doppelzuordnung und nachträglicher Zuordnung/Ablehnung. Laufzeit in Production ist weiterhin zu messen; der lokale Erfolg ist kein Produktionsmesswert.

Juan hat bestätigt: Claude löst nach dem Code-Push den Worker aus und misst den Patientenabruf. Nach 19:00 Berlin nur Aufnahme, kein Mailversand. Erwartete Rückmeldung: drei warme/kalte Patientenabrufe mit HTTP-Status, Gesamtdauer, `Server-Timing`, Belegzahl; PDF-Status/-Dauer; der außerhalb Q1–Q3 liegende verschickte Beleg muss enthalten sein. Danach Worker-Resultat und Verteilung `worker_state` / `initial_delivery`. Bisheriger Produktionsstand für die 325: vollständig `not_in_worker`, also noch keine bestätigte Aufnahme.
