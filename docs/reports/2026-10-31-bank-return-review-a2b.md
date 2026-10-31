# A2b – Ursprungsbetrag, Abgang und Belegkette getrennt prüfen

Stand: 31.10.2026. Fortsetzung von A2a. Ausschließlich lesende Betreiberprüfung; keine historische Zahlungsbereinigung, keine Umbuchung, keine Mahnung und kein erneuter Versand.

## Gebaut

Die Rückgabenprüfung vergleicht bei einer eindeutigen End-to-End-Referenz nicht mehr nur den Betrag. Sie verfolgt die bestehende Belegkette der **Ursprungszahlung** auch bei abweichendem Abgang weiter:

- `amounts.originalCents`: tatsächlich archivierter ursprünglicher Eingang.
- `amounts.debitedCents`: tatsächlich archivierter negativer Abgang, als positiver Vergleichsbetrag.
- `amounts.differenceCents`: reine Rechendifferenz, **keine Gebührenfestsetzung**.
- `bankFeeCents` und `patientFeeCents` bleiben ausdrücklich `null`; auch eine Bankgebühr wäre nicht automatisch eine Patientenforderung.
- Arbeitsbuchung und bestehende Patientenzuordnungen müssen weiterhin genau den Ursprungsbetrag belegen. Die höhere Rückgabe darf keine überhöhte Zuordnung legitimieren.
- Widersprechende Mandats-/Gläubigerangaben blockieren auch bei gleicher Zahlungsreferenz. Fehlende Angaben werden nicht erfunden.
- Teilrückgaben, Mehrfachrückgaben, vorherige Entscheidungen und widersprüchliche Rechnungs-/Ratenzuordnungen bleiben gesperrt. Bei Mehrfachrückgaben werden Patienten-/Rechnungs-/Ratenprojektionen geleert.
- Bei fehlender Zahlungsreferenz kann gleicher Kontext aus Konto, Verbindung, Währung, Mandat, Gläubiger, IBAN und zeitlich früherem Eingang angezeigt werden. **Auch genau ein solcher Kandidat setzt niemals `originalId`, Patient, Rechnung oder Rate.** Die Vollständigkeit des Archivs wäre damit nicht bewiesen.
- Alle Ergebnisse bleiben `canApply: false`; keine Mutation, kein `--apply`, keine neue Rolle oder Migration. Das CLI gibt ausschließlich aggregierte Zahlen aus, keine Patienten, Kontoinhaber, Kennungen oder Referenzwerte.

Die Änderungen betreffen nur `payment-return-review.ts`, den lesenden Audit und Tests. Kein neuer Hintergrundjob, keine Oberfläche und kein Bankimport wurde aktiviert oder umgebaut.

## Produktionsbefund – lesend

Erster erweiterter Audit am 31.10.2026, 03:00:05–03:00:23 Europe/Berlin, im bereits im Bank-Sync festgelegten Praxiskonto. Wiederholter Audit des finalen Codes um 03:01:50–03:02:09 bestätigt dieselben Zahlen:

| Befund | Anzahl |
|---|---:|
| Archivbuchungen / davon negative Buchungen | 16.185 / 759 |
| Negative Buchungen mit unterstütztem Rückgabe-Text | 539 |
| Eindeutige Zahlungsreferenz und bestehende bestätigte Patientenzuordnung, aber Betragsdifferenz | 137 |
| Eindeutige Zahlungsreferenz, Patientenzuordnung nicht bestätigt | 4 |
| Eindeutige Zahlungsreferenz, bestätigte Ledger-Zuordnung fehlt oder ist unvollständig | 3 |
| Keine verwendbare Zahlungsreferenz | 395 |
| Rechnungszuordnungen in den 137 geprüften Ketten | 1 |
| Direkte Raten-Transaktionsverweise in den geprüften Ketten | 0 |

137 bezeichnet Rückgabe-Buchungen mit einer nachvollziehbaren **bestehenden** Patientenzuordnung, nicht 137 unterschiedliche Patienten, endgültig bestätigte Rückgaben oder freigegebene Finanzkorrekturen. Null direkte Ratenverweise heißt nicht, dass diese Patienten keine Ratenpläne haben. Die vorhandenen Datensätze liefern diesen konkreten Bezug nicht.

Die 144 referenzierten Abgänge liegen über dem jeweiligen Eingang. Rechendifferenzen: 103 × 5,00 €, 3 × 6,25 €, 16 × 7,13 €, 1 × 7,46 €, 2 × 7,84 €, 18 × 8,00 €, 1 × 9,47 €. **Diese Werte sind keine nachgewiesenen oder abrechenbaren Gebühren.**

Alle 539 Texttreffer tragen im Archiv den Banktyp `LS RUECKBELASTUNG` mit `NRTI` / `109`. Das ist ein beobachtetes Quellmerkmal, kein neu implementiertes Mapping beliebiger Bankcodes und keine Freigabe zur automatischen Korrektur.

## Warum die 395 fehlenden Referenzen offen bleiben

Lesende Quellenprüfung:

- Bei allen 395 Rückgaben sind Mandat, Gläubiger und Gegenkonto hinterlegt, aber keine End-to-End-Referenz.
- Unter 15.426 positiven Archivbuchungen enthalten 10.729 eine Mandatsreferenz; **keine** enthält eine Gläubigerkennung.
- Für 341 Rückgaben existiert ein früherer Eingang mit derselben Mandatsreferenz; für 394 existiert ein früherer Eingang mit demselben Gegenkonto. Das sind getrennte Bestandszählungen, keine sichere Paarung und kein Nachweis einer bestimmten Rate.
- Damit liefert der vollständige Mandat-/Gläubiger-Kontext aktuell keinen belegten Kandidaten. Identität, ähnliche Beträge, die jüngste Zahlung oder Namensähnlichkeit ersetzen den fehlenden Einzelbeleg nicht.
- Die 395 Rückgaben verteilen sich auf 2024 (94), 2025 (200) und 2026 (101). Dies ist keine aktuelle Liste von 395 neuen Aufgaben für Sabine.

Benötigt wird für eine automatische Altbestandskorrektur der Bezug zum konkreten ursprünglichen Einzug, beispielsweise aus dem bestehenden Einzugsauftrag/SEPA-Sammler bzw. einem Rückgabebeleg. Zuerst die vorhandenen Importquellen und Belege durch den Betreiber prüfen. Keine ungefilterte Prüfliste an die Praxis ausgeben.

## Prüfung und Veröffentlichung

- 20 Rückgaben-Tests, davon 6 neue gegenüber A2a: abweichender Betrag bei belegter Kette, widersprechende Mandats-/Gläubigerangaben, unveränderte Betragsprüfung im Ledger, fehlende Folgebelege, wiederholte Mandate und bloß einzelne Kandidaten. Bestehende Schutztests bleiben erhalten.
- Vollständige Testkette: **293 Tests bestanden**, zusätzlich 42 RPC-Verträge ohne Verletzung. Auch nach letzter CLI-Ausgabeergänzung gezielter Test (20 Tests), Typprüfung und Build erneut erfolgreich. Produktions-Schemacheck um 03:02:10 Europe/Berlin erfolgreich, einschließlich 42 RPC-Verträgen. Die vorhandenen freigegebenen Plattformwarnungen zu `supabase_admin` bleiben unverändert.
- GitHub-Prüfung und Produktions-Build werden nach dem selektiven Commit kontrolliert. Unabhängige Worktree-Änderungen werden nicht veröffentlicht.
- Fachliche Abnahme einer automatischen Umbuchung: **nicht erfolgt, nicht implementiert**. Sequenzielle Leseaufnahme, kein atomarer Snapshot und kein ausführbares Korrekturmanifest.

## Nächster Umsetzungsschritt

1. Bereits vorhandene Einzugs-/Rückgabebelege lokalisieren und das Format mit synthetischen Beispielen prüfen; keine fehlenden Referenzen aus Betrag oder Datum erraten.
2. Für belegte Einzelfälle eine Vorschau des Hauptbetrags, ungeklärter Zusatzbeträge und der tatsächlich betroffenen Forderungen erzeugen. Fehlende Ratenverweise bleiben sichtbar und werden nicht aus dem Namen abgeleitet.
3. Erst mit diesem Vertrag den atomaren, wiederholsicheren Korrekturbefehl und Zwei-Verbindungs-Tests bauen. Rechnungszuordnung vor Patientenzuordnung rücknehmen; Gebühren gesondert belegen; keine echten Altfälle für Tests verändern.

Die im A2a-Bericht dokumentierten AnimaSign-/Scribe-Übertragungslücken sind ein separater Arbeitsstrang. In diesem Schritt wurden weder Einreichungen noch Worker erneut gestartet.
