# Kommunikationsabläufe – 28.09.2026

## In diesem Änderungspaket

- Anamnese beginnt als Entwurf, nicht fälschlich als bereits signiert. Abschluss erfordert signiertes PDF und Zeitstempel. Webhook-Datenbankfehler werden nicht als Erfolg quittiert; ein verspätetes Pending/Rejected darf keinen Abschluss überschreiben.
- Separate, personalisierte und kontrastreiche 24-Stunden-Anmeldeerinnerung als HTML und Klartext. Kein behaupteter Rechnungseingang, keine erfundene gesetzliche App-Pflicht und keine Gebühren für Nicht-Anmeldung.
- Eigener Standardablauf in der bestehenden Automatisierungsverwaltung, alle 15 Minuten geprüft. Neue Einreichungen ab Aktivierung; kein stiller rückwirkender Massenversand. Aktivierung über `npx tsx scripts/configure-portal-activation.ts --activate`; vorher `--check`.
- Alle Anamnesen werden gelesen; unklare Patientenzuordnung, fehlender Zugang, gesperrte Konten und gemeinsame Familienadressen werden nicht automatisch angeschrieben. Die Fälle bleiben im Audit erhalten.
- Unveränderliche Versand-ID je Empfänger, atomare Datenbankreservierung, erneute Kontakt-/Kontoprüfung vor Versand und Provider-Idempotenz. Ungewisse Versandresultate bleiben zur Prüfung stehen und werden nicht blind wiederholt. „Angenommen“ ist nicht „zugestellt“.
- Testversand ist jetzt ein angemeldeter POST, kein öffentlich auslösbarer GET mehr. Ein neuer Mail-Empfangstest ist separat erforderlich; die Browser-Vorschau allein beweist keine Zustellung.

## Noch nicht erledigt

1. Rechnungslauf produktiv auf Tag 3/14/28 umstellen, verlässlichen rechnungsspezifischen Empfangs-Touchpoint und aktuellen Zahlungsabgleich vor jedem Versand nachweisen. Die getestete Zeitregel allein ist noch keine aktive Mahnautomatik.
2. Historische Anmeldefälle und gemeinsame Familienkontakte nach geprüfter Empfänger-/Zugangsklärung abarbeiten.
3. Anamneseverwaltung vereinfachen und den vollständigen Unterschriftsprozess im Browser Ende-zu-Ende prüfen. Vorhandene fremde Änderungen an den Patientenoberflächen wurden nicht mitveröffentlicht.
4. Bestehende allgemeine Workflow-Ausführung reparieren: Code erwartet `trigger_kind`, `steps`, `patient_id`; Produktivschema besitzt stattdessen `trigger_event` und `result`. Außerdem sind alte 6-Tage-Mahnworkflows konfiguriert. Nicht durch eine pauschale Schemaänderung ungeprüft aktivieren.

## Nachweise

Unit-Tests decken 24-Stunden-Grenze, Wiederholungseinreichung, Anmeldung, Kontosperre, uneindeutige Kontakte, Versand-ID, HTML-Escaping, Unterschrifts-Abschluss und 3/14/28 ab. Die Mail wurde bei 390 und 1200 Pixel Breite ohne horizontalen Überlauf gerendert. Produktionsversand und Zustellung sind gesondert zu prüfen.
