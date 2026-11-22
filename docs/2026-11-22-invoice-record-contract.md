# Gemeinsame Rechnungsakte – Datenvertrag, Juan 22.11.2026

## Lieferstand und Abnahmegrenzen

Gemeinsamer Lesekern in `anima-leitstand/src/abrechnung/server/invoice-record.ts` und rein fachliche Projektion in `domain/invoice-record.ts`. Die drei Oberflächen erhalten denselben Belegbestand über denselben Kern. Keine Rechnungs- oder Zahlungsbuchung wird geändert. Claude baut die Rechnungsansicht im Patientenprofil der Hauptplattform und im Leitstand.

**Produktionszählung durch Claude nach Installation von 030 und 031, von Juan am 22.11.2026 übermittelt:** 2.272 eindeutige Q1–Q3-Rechnungen; 2.271 zugeordnet und sichtbar bei 1.008 Patienten; eine ohne Zuordnung (`patient_number_not_found`, Prüfung offen); keine ungültigen PDFs. 1.946 Rechnungen bei 827 Personen haben laut Prüfung einen Versandnachweis, 325 sichtbare Rechnungen bei 181 Personen noch keinen. Die früher genannten 2.080 sind als Bestandszahl verworfen. Die Differenz zur früher berichteten Versandzahl 1.947 ist noch nicht erklärt; sie darf nicht durch bloßes Ändern der Sollzahl als geklärt gelten. Prüffall: Q3, 12 Positionen, gültiges PDF, richtiger Patient bestätigt; Betrags-/Kurzfassungsvergleich weiterhin gesondert nachweisen.

Die Aufteilung ist konsistent: 1.946 + 325 = 2.271 sichtbare Rechnungen, plus eine offene Zuordnung = 2.272. Kein Schluss allein aus der Personensumme auf disjunkte Patientengruppen. Ergänzender Abgleich: `docs/2026-11-22-invoice-reconciliation-readonly.sql` (nur lesend). Dieser ersetzt die alten Messlatten in der bereits ausgeführten, unverändert archivierten Prüfabfrage `031_invoice_record_audit_readonly.sql`.

Juan hat am 22.11.2026 bestätigt, dass Claude die lesende Prüfung über die bestehende Supabase-Sitzung übernimmt. Prüfabfrage: `database/abrechnung/031_invoice_record_audit_readonly.sql`. Sie liest alle Q1–Q3-Importe, zählt Identitäten, listet ausgeschlossene Quellbelege samt Grund und vergleicht die Zustellrunde. Für den in Juans Nachricht genannten Einzelprüffall in derselben Sitzung vor Ausführung `anima.invoice_audit_number` und `anima.invoice_audit_summary_cents` auf die mitgeteilten Werte setzen. Diese Identifikatoren werden nicht im Repository hinterlegt. Erwartung: vollständiger Beleg mit 12 Positionen; Kurzfassungsbetrag gegen den tatsächlichen Belegbetrag prüfen, nicht als Gleichheit voraussetzen. SQL enthält `BEGIN READ ONLY`/`ROLLBACK`. Keine Identitätskorrektur wird allein aus einem Namensvergleich übernommen.

## Installation

Neue Migration `database/abrechnung/031_invoice_record_sources.sql`, Ziel **Anima Cura**, Projekt **zymqxzhjbcxzhzvjqvbv**, Laufname **2026-11-22-invoice-record-031**, SHA-256 **4674cfcd8f188daea8e87ec7fdfa3eab631bafbd792f5158f9d0f7339dd1aee0**. **Von Juan am 22.11.2026 ausdrücklich für Claude zum Einspielen freigegeben** (Antwort: „Für Claude zum Einspielen freigeben“). Die Freigabe gilt genau für die oben genannte Datei, Prüfsumme, Projekt-ID und den Laufnamen. Juan hat anschließend Claudes Ergebnis für 030 und 031 mit „eingespielt“ und unveränderten Prüfsummen bestätigt. Voraussetzung: Rechnungszugriff einschließlich Quellen aus Migration 030. Zwei schmale lesende Views für frühere Dokumente und zugeordnete Zahlungen; kein neues öffentliches RPC, keine Änderung vorhandener Funktionsdefinitionen, kein `auth`-Schema-Recht und keine öffentlichen Schreibrechte für `abrechnung_runtime`. Der Projektwächter bricht vor Änderungen ab. Letzte Ergebniszeile: Dateiname und `eingespielt`.

Vor Installation bleibt `/api/rechnungsakte` mit 503 ausdrücklich nicht verfügbar. Die bestehende Patientenroute hält den bisherigen Abruf aufrecht und meldet `rechnungsaktenStatus: unavailable`. Das ist ein Übergang, keine fertige Aktenabnahme. Sobald Quellen verfügbar sind, verwendet die Patientenroute gemeinsame vollständige Belege, deren Zahlungsstände und PDF-Ziele; zugeordnete Kurzfassungen verschwinden als eigenständige Rechnung und erscheinen unter „Frühere Fassungen“.

## Ausführung und Rückmeldung durch Claude

Migration 030 muss installiert sein. Vor dem Einspielen von 031 die Datei auf `main` gegen die oben freigegebene SHA-256 prüfen; SQL-Datei und Prüfsumme bleiben unverändert. Die bestehende angemeldete Supabase-Sitzung für das angegebene Zielprojekt verwenden. Danach Dateiname, Ergebnis `eingespielt`, Laufname und Prüfsumme zurückmelden. Die Freigabe selbst ist kein Installationsnachweis.

Anschließend die bereits autorisierte lesende Prüfabfrage ausführen und ohne Patientennamen berichten: Gesamtzahl eindeutiger Q1–Q3-Rechnungen, zugeordnet und sichtbar, zugeordnet und noch nicht benachrichtigt, gesperrt bzw. nicht zugeordnet mit Gründen sowie Abgleich mit den bestätigten 1.946 Rechnungen / 827 Personen und Erklärung der alten Zahl 1.947. Den von Juan genannten Einzelprüffall auf 12 Positionen, tatsächlichen Betrag, PDF und zugeordnete Kurzfassung prüfen. Patienten-, Familien- und Praxiszugriff über die gemeinsame API prüfen; fremden Patientenzugriff ablehnen. Installation, Funktionsprüfung und vollständige Zuordnung getrennt bestätigen.

## Schnittstellen und Rechte

- Hauptplattform und Patienten-App: `GET /api/rechnungsakte?patientId=<uuid>` auf animacura.io. Identität kommt aus der verifizierten Sitzung, nie aus einem vom Browser gelieferten Konto.
- Patient ohne `patientId`: gesamter verifizierter Profil-/Mitgliedschaftsbereich. Fremde Patienten-ID: 403. Nur freigegebene vollständige Belege werden geliefert.
- Praxis: bestehende Sitzung mit Modulrecht `rechnungen` mindestens `lesen`, geprüft im Leitstand anhand des dortigen autoritativen Profils. Eine Patientensitzung kann nicht als Praxiskonto auftreten.
- Leitstand: `GET /api/abrechnung/invoice-records?patientId=<uuid>`, derselbe Kern und dieselben Praxisrechte.
- Praxis ohne Patientenauswahl: `detail: inventory`, vollständiges kompaktes Register mit `positionCount`, ohne die umfangreichen Leistungszeilen. Abruf mit Patientenauswahl: `detail: patient_records`, vollständige Positionen, Begründungen, Zahlung und Zustellung.
- Vollständiges PDF: Cura `GET /api/rechnungsakte?documentId=<id>`; Leitstand `GET /api/abrechnung/invoice-records?documentId=<id>`. Originalbytes aus dem Sammel-PDF. Praxis darf zu prüfende Quellen lesen; Patient nur freigegebene Belege seines Bereichs. PDF-Abruf durch Praxis beendet keine Patientenerinnerung.
- Kurzfassung: Cura `GET /api/rechnungsakte?historyId=<documentId>`, nach erneuter Prüfung über die gemeinsame Akte und den vorhandenen geschützten PDF-Lader. Für eine verlinkte Hauptplattformansicht ist dies auch mit Praxisrechten verfügbar.
- Geschützter serverinterner POST der Leitstandroute verwendet den vorhandenen Worker-Schlüssel. Nur die Cura-Serverroute setzt `accountId` aus `getUser()`. Schlüssel und internen POST niemals an den Browser geben.
- Keine öffentlich gecachten Antworten; Fehler liefern `invoice_record_unavailable`/503, keine angeblich vollständige leere Akte.

## Nutzdaten `invoice-record-v1`

Antwort: `contractVersion`, `detail`, `asOf`, `records`, `discrepancies`, `unmatchedHistory`, `coverage`.

Je Rechnung (Patientendetail):

| Feld | Bedeutung |
|---|---|
| `id`, `key`, `sourceIds` | kanonischer vollständiger Beleg, normalisierte Rechnungsnummer, sämtliche Quell-IDs derselben Identität |
| `patientId`, `quarter`, `art`, `invoiceNumber`, `date`, `reference` | Zuordnung und Rechnungsbezug; nicht erhobene Werte bleiben null |
| `amountCents` | Patientenanteil, ersatzweise im Beleg ausgewiesener Gesamtbetrag; ganzzahlige Cent, nie aus einem Anzeigenamen ersetzt |
| `positions`, `reasons` | vollständige IVORIS-Leistungszeilen und Begründungen im bisherigen Parserformat |
| `patientVisible`, `reviewReason` | tatsächliche Freigabe bzw. Grund einer offenen Zuordnung oder Veröffentlichung |
| `payment` | nur bei genau einem eigenen offenen Posten mit exakter Rechnungsnummer; sonst null |
| `payment.amountCents/openCents/paidCents/status/openItemId` | gebuchter Stand des offenen Postens, unbekannte Zahlen bleiben null |
| `payment.allocations` | einzelne eigene Zahlungszuordnungen mit Betrag, Buchungstag, Transaktionsreferenz, Status und Gegenbuchungsreferenz; nicht zusätzlich auf `paidCents` addieren |
| `paymentReviewReason` | `open_item_not_linked` oder `ambiguous_open_item` statt erfundener Zahlung |
| `delivery[]` | Ereignisart, Zeit und Beleg-ID; `version: current/history` unterscheidet vollständigen Beleg und frühere Kurzfassung |
| `history[]` | Dokument-ID, `kind: quarter_summary`, Ablagezeit, Betrag, Differenz und Prüfstatus |

`delivery.kind`: `mail_accepted` ist lediglich Annahme durch den Versanddienst, nicht bewiesene Zustellung; `mail_delivered` ist ein explizites Providerereignis; `mail_opened` kann maschinell ausgelöst sein. `mail_bounced`, `mail_complained`, `mail_suppressed` und `mail_failed` geben vorhandene Providerzustände wieder. `app_notice_created` ist ein angelegter App-Hinweis, `push_sent` ein erfolgreicher Push-Versuch, keine behauptete Geräteanzeige. `invoice_opened` und `pdf_retrieved` bezeichnen den tatsächlichen autorisierten Belegzugriff. Fehlendes Ereignis bedeutet „kein Nachweis“, nicht „sicher nicht passiert“. Historische Signale gelten nicht als Öffnung des vollständigen Belegs. Die bisherige Erinnerungssteuerung wird durch diese Leseschicht nicht umgeschrieben.

Die bestehende Patientenroute `/api/patient/rechnungen` ergänzt `rechnungsaktenStatus`, `rechnungsakten` und `rechnungsverlaufOhneZuordnung`. Bei verfügbarer gemeinsamer Quelle enthalten `rechnungen[].beleg.history[]` die Historie samt `pdfUrl`; vollständige PDFs zeigen auf die gemeinsame Route. Erkannte Kurzfassungen (auch unzugeordnete) stehen nicht mehr als eigenständige Rechnung in `rechnungen[]`. Unzugeordnete Kurzfassungen zeigt die Patienten-App als getrennten Verlauf. Andere hochgeladene Rechnungen bleiben erhalten. `/api/patient/dokumente` wird hier nicht geändert; die bestehende Rechnungsausschlussregel gilt weiter.

## Frühere Fassungen und Betragsprüfung

Historische Kurzfassungen werden anhand ihres veröffentlichten Namensformats und der deterministischen UUID-v5-Kennung des Quartalspublishers erkannt; manuell gleich benannte Uploads werden nicht automatisch umgehängt. Zuordnung nur bei genau einer Kurzfassung und genau einem vollständigen Beleg desselben Patienten, Quartals und derselben Abrechnungsart. Vergleich in Cent; **Betragsgleichheit ist keine Identitätsregel**. `association: unique_patient_quarter_art` legt die verwendete Grundlage offen. Bei mehreren Kandidaten: `unmatchedHistory.reason: ambiguous_invoice`; ohne Kandidat: `complete_invoice_missing`; bei mehreren Kurzfassungen: `ambiguous_history`. Für Patienten bleibt eine bereits vorhandene Kurzfassung auch bei gesperrtem vollständigem Beleg im Verlauf (`complete_invoice_unavailable`). Solche Fälle nicht als erledigte Zuordnung darstellen.

`history.comparison`: `equal`, `different`, `unknown`. `amountDeltaCents = Kurzfassung minus vollständiger Beleg`. Abweichungen stehen zusätzlich in `discrepancies` mit beiden Belegreferenzen. Die frühere Kurzfassung wird unverändert abrufbar gehalten, aber weder ihre Zeilenlosigkeit noch ihr Betrag ersetzen den vollständigen Beleg. Ungeklärte Historien bleiben ausdrücklich sichtbar; keine Zusammenführung nach Namen oder Summen.

## Vollständigkeit

`coverage.scope` ist `all` oder `patients`. Globale Sollwerte nur auf `scope: all` anwenden. `uniqueInvoices` zählt Rechnungsidentitäten, `sourceRows` sämtliche Importzeilen; Doppelimporte mit widersprüchlicher Zuordnung oder Signatur werden als Konflikt geführt. Zurückgezogene Quellen verschwinden nicht aus dem Nachweis.

- `assignedVisible`: zugeordnet und für den Patienten freigegeben.
- `assignedNotNotified`: Teilmenge davon ohne Annahmenachweis einer Mail für den vollständigen Beleg. Dies nicht als bewiesen fehlende Post-/Appzustellung beschriften.
- `notifiedInvoices`, `notifiedPatients`: Mailannahmen für den aktuellen vollständigen Beleg; historische Kurzfassungsmails zählen nicht ersatzweise dazu.
- `assignedButBlocked`: zugeordnet, aber noch nicht in der Patienten-App freigegeben.
- `unassigned`: ohne eindeutigen Patienten.
- `unresolved[]`: Belegreferenz und Grund, u. a. `patient_number_not_found`, `assignment_rejected`, `conflicting_patient_assignment`, `conflicting_invoice_versions`, `batch_withdrawn`, `not_released`, `pdf_unavailable`.
- `expected`: 2272 / 1946 / 827 nach der übermittelten Produktionszählung. `accepted` ist bei Patientenauswahl null; global erst wahr bei 2272 Identitäten und sichtbaren Belegen sowie mindestens der bestätigten ersten Versandmenge. Mit einer offenen Zuordnung bleibt `accepted` falsch. Ein wahres Flag beweist weder die Erklärung der früheren Versanddifferenz noch den Versand des Restbestands. Dieses Flag ersetzt keine fachliche Prüfung der Betragsabweichungen.

Die Rückmeldung aus Production muss die konkreten restlichen Gründe liefern. Erst danach werden erforderliche Zuordnungskorrekturen mit Quellnachweis über die vorhandenen geprüften Zuordnungsbefehle nachgezogen. Nicht auf unbekannte Patienten oder Ersatzprofile umbuchen.

## Auftrag an Claude für die Oberflächen

Im Patientenprofil der Hauptplattform einen Bereich „Rechnungen“ aus der neuen API bauen, getrennt von „Dokumente“. In „Dokumente“ Rechnungen/Erste Rechnungen einschließlich der alten `[[typ:rechnung]]`-Kodierung ausschließen; vorhandene `decodePatientDocumentRecord`/`isInvoiceDocumentType` verwenden. Ratenzahlungsvereinbarungen, Kostenpläne und Verträge bleiben dort. Keine neuen lokalen Rechnungslisten aus `patient_documents` erstellen.

Leitstand denselben Datensatz verwenden; Register, Zustellnachweise, Zahlungsbezug, abweichende Beträge und unzugeordnete Belege sichtbar machen. In der Patienten-App sind die gemeinsame API-Anbindung und der Link „Frühere Fassungen“ bereits vorbereitet. Keine Oberfläche darf eine fehlende Quelle als leere fertige Akte ausgeben.

Abnahme nach Ausführung der nun freigegebenen Installation: Patient, Familienzugang, Praxis mit Leserecht sowie verbotener Fremdpatient; derselbe Beleg mit identischer Positionszahl, Begründungen, Betrag und PDF in allen Oberflächen; Kurzfassung nur im Verlauf; Sollzahlen gegen Istzahlen und Gründe; genannter Einzelprüffall. 2.271 von 2.272 Zuordnungen sind bestätigt; eine bleibt offen. Die Umstellung der Praxisoberflächen ist gesondert abzunehmen.
