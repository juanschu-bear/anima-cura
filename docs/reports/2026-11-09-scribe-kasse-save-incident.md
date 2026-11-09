# Speicherfehler Scribe und Kasse — 09.11.2026

## Befund vor der Korrektur aus Production, nur lesend

`doku_eintraege_behandlungsart_check` erlaubt ausschließlich `aligner`, `removable`, `multiband`. Aktive Vorlagen enthalten zusätzlich sieben `custom-{UUID}`-Behandlungsarten. Migration 052 hatte die Beschränkung bei Vorlagen/Optionen/Praxispass entfernt, aber nicht bei den Einträgen. Die eigene Behandlungsart wird daher beim Speichern abgelehnt, obwohl sie auswählbar ist.

`kassen_zahlungen_zahlart_check` erlaubt fünf Zahlungsarten, aber nicht `ueberweisung`. Die Kassenoberfläche bietet diese normale Überweisung bereits an; Migration 033 beschreibt die Ergänzung, Production hat weiterhin die alte Definition. Welche konkrete SQL-Datei ursprünglich nicht eingespielt wurde, lässt sich allein aus der Constraint-Definition nicht nachweisen.

Die Fehlermeldungen bedeuten, dass der jeweilige INSERT abgelehnt wurde. Keine Testzahlung und kein Testeintrag in Production angelegt.

## Korrektur

Archiviert: `supabase/migrations/077_scribe_custom_types_and_cash_transfer.sql`.
SHA-256: `c2c0d02b2f4e497679e3423d30886b41fb327e9a20cc671131e58f049b86a5c8`.
Eine Transaktion, 5 Sekunden Lock-Timeout, nur die zwei Prüfregeln. Die drei ursprünglichen Behandlungsarten sowie gültige `custom-{UUID}`-Schlüssel sind erlaubt; Zahlungsarten werden um `ueberweisung` ergänzt. Betrag-, Quartals-, Statusprüfungen und Zugriffsrechte bleiben erhalten. Keine Datensatzänderungen, Bestätigungen oder Buchungen.

Scribe schützt den Patientenwechsel und Mitarbeiterwechsel: Entwurfsspeicherung muss erfolgreich abgeschlossen sein, andernfalls bleibt die Eingabe im Formular. Geänderte bestätigte Einträge müssen zuerst als Version/Korrektur gespeichert werden. Laufende Speicherung und zwischenzeitlich geänderter Text verhindern das Verlassen. Beim Schließen/Neuladen warnt der Browser vor ungespeicherten Angaben. Keine klinischen Texte neu in Browser-Speicher geschrieben. Dieser Schutz rekonstruiert keinen Text, der vor der Bereitstellung bereits verworfen wurde.

## Prüfung und Bereitstellung

Beide alten Constraints mit synthetischen Daten in isoliertem PostgreSQL (PGlite) reproduziert; nach 077 alle sechs Zahlungsarten und Standard-/eigene Behandlung erfolgreich geprüft, ungültige Arten und Betrag 0 weiterhin abgelehnt. Patientenwechsel bei Fehler, laufender Speicherung und geänderter bestätigter Dokumentation getestet.

399 Tests erfolgreich, Build erfolgreich. `npm test` endet beim abschließenden Live-RPC-Audit mit zwei schon fehlenden Rechnungsdesign-Funktionen (`patient_invoice_document_edition`, `patient_invoice_document_editions`, aus noch nicht installierter Leitstand-Migration 027). Keine Prüfregel übersprungen oder gelockert. Der Scribe-/Kassen-Fix führt keine neue RPC ein.

## Production-Abschluss am 09.11.2026

077 nach erneutem SHA-256-Abgleich unverändert im SQL-Editor des Projekts `zymqxzhjbcxzhzvjqvbv`, main/PRODUCTION, ausgeführt: `Success. No rows returned`. Die anschließende lesende Prüfung über `pg_get_constraintdef` bestätigt beide neuen Definitionen mit `convalidated = true`. Die übrigen acht CHECK-Constraints sind unverändert, einschließlich `betrag > 0`.

Vorlagenabgleich: 10 aktive Behandlungsarten, 10 durch die neue Prüfung unterstützt, 0 nicht unterstützte aktive Vorlagen. Keine echten Scribe-Einträge oder Kassenbuchungen zum Test angelegt. Damit sind die zwei gemeldeten Constraint-Ursachen beseitigt; ein vollständiger Bedienablauf mit echter Praxisbuchung wurde nicht durchgeführt.

Code `af738e9` ist als Production-Deployment READY bereitgestellt, einschließlich `animacura.io` und `scribe.animacura.io`: `https://anima-cura-qssh9aq17-juanschu-bears-projects.vercel.app`. Der Schutz beim Patientenwechsel ist darin enthalten. Bereits offene Cockpits müssen den neuen Code laden; vor dem Neuladen noch ungespeicherten Text sichern.

Lokaler Screenshot der installierten und validierten Regeln: `/tmp/anima-save-077-verification.png`.
