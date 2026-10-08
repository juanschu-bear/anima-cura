# Abrechnungsupgrade – verbindliche Grenzen und Reihenfolge

Stand: 2026-10-08. Dieser Plan ist keine Freigabe zum Versand von Rechnungen.

## Unveränderliche Regeln

- Identität: Die bestehende `patients.id` ist der gemeinsame Bezug. Patient, Rechnungsempfänger und Zahlender sind unterschiedliche Rollen. Keine automatische Zusammenführung anhand eines Namens.
- Evidenz: Jeder Leistungsvorschlag hat Quelle, Quellversion und Position in der Quelle. Dokumentationsbestätigung ist keine Rechnungsfreigabe. Fehlende oder mehrdeutige Angaben werden nicht durch Standardwerte ergänzt.
- Preise: Tarifquelle, Gültigkeitszeitraum, Gebührenbereich und gegebenenfalls Kostenträger müssen feststehen. Keine Paketauswahl aus einem ähnlichen Gesamtbetrag. Eine Summenliste kontrolliert, beweist aber keine Einzelpositionen.
- Ausstellung: Genau ein ausstellendes System je Rechnung. Nummer und unveränderlicher Rechnungssnapshot werden erst bei einer atomaren Freigabe gespeichert. Erneute Aufrufe dürfen keine neue Rechnung oder Nachricht erzeugen.
- Geld: Alle Ansichten verwenden dieselbe bestätigte Zahlungszuordnung. Patientenbezogene Guthaben und noch nicht zugeordnete Zahlungen bleiben sichtbar. Keine mehrfach verwendeten Zahlungseingänge.
- Sicherheit: Ein Entwurf wird nicht versendet, nicht als Forderung verbucht und nicht angemahnt. Fehler halten den betroffenen Fall an. Unbekannt ist weder bezahlt noch offen.

## Inkremente und Abnahme

1. **Evidenz und sichere Entwürfe:** strukturierter, testbarer Prüfvertrag; Scribe-Adapter ohne erfundene Mengen; lesende Prüfung mit expliziten Datenlücken; unsicheren Generator ersetzen; Vorschau eindeutig als Entwurf kennzeichnen. Keine Änderungen an Patienten, Zahlungen oder ausgestellten Rechnungen.
2. **Persistente Leistungs- und Tarifversionen:** getrennte fachliche Bestätigung, Quelle/Revision, exakte Dezimalberechnung und datumsbezogene Tarife. Nacharbeiten aus IVORIS benötigen einen nachgewiesenen Rückweg. Vergleich gegen freigegebene Praxisbeispiele, zunächst ohne Versand.
3. **Quartalsabgleich:** Listenimporte mit Prüfsummen und Herkunft, eindeutige Patientenzuordnung, centgenaue Summenkontrolle, vollständige Ausnahmeübersicht. Fehlende Positionen bleiben sichtbar.
4. **Ausstellung und Portal:** transaktionale Nummernvergabe, Idempotenz, unveränderliches PDF, Empfängerberechtigung, Korrektur/Storno und einmalige Benachrichtigung. Bestehende Originalrechnungen nicht erneut ausstellen.
5. **Einheitliches Patientenkonto:** bestehende Zahlungsledger-Bausteine über alle Ansichten integrieren; Bankfrische, Familienzahlungen, Teilzahlungen, Guthaben, Lastschriften und Rückbuchungen prüfen.
6. **Betrieb und Freigabe:** durchgängige Tests einschließlich Doppelaufrufen und fremden Portalzugriffen; Fehleralarme, Wiederholungen, Wiederherstellungstest und stufenweise Aktivierung.

Erst nach der jeweiligen Abnahme darf ein Inkrement als produktiv abgeschlossen gelten. Das Vorhandensein von Code oder ein erfolgreicher Build beweist weder korrekte historische Daten noch vollständige Abrechnungen.

## Stand des ersten Inkrements

Implementiert: lesende, berechtigungsgeprüfte Abrechnungsprüfung am bestehenden Patientenaufruf; paginierter Scribe-Quellabruf; Positionsvertrag mit Herkunft/Version, datiertem Tarif und exakter Centberechnung; strikter Scribe-Kopierexport ohne Mengenannahmen; sichere Entwurfsanzeige ohne zufällige Rechnungsnummer oder Zahlungsaufforderung. Datumswerte bleiben unabhängig von der Browserzeitzone am richtigen Leistungstag. Ein pauschaler BEMA-Eigenanteil wird nicht auf GOZ-Positionen angewandt.

Prüfnachweise: automatisierte Tests für Rechenregeln, Quellenlücken, Dubletten, Berechtigungen, Fehlerantworten und Entwurfsdaten; vollständiger Produktionsbuild; isolierte Browserprüfung der tatsächlichen Vorschaukomponente mit synthetischen Daten auf Desktop, Mobilgerät und im Druck. Die zusätzlichen Abrechnungstests laufen künftig mit `npm test`.

Noch nicht enthalten: persistenter Tarifkatalog/Positionseditor, vollständiger IVORIS-Rückabgleich, Quartalslistenimport, transaktionale Rechnungsausstellung und Veröffentlichung im Patientenportal. Bestehende Paketpreise im Entwurfseditor sind keine neu geprüften Tarife. Der Status `ready_for_review` ist ausschließlich eine technische Vorprüfung, keine Abrechnungsfreigabe oder Zusicherung rechtlicher Vollständigkeit. Die browserseitige Prüfung ersetzt keinen authentifizierten Produktions-Durchlauf mit freigegebenen Praxisbeispielen.

Dieser Ausbauschritt führt keine Datenmigration aus, ändert keine Patientensalden und erstellt oder versendet keine Patientenrechnungen.
