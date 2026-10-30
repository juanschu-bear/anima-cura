# Scribe Zimmer — 30.10.2026

## Umfang

Neue Einträge in klassischem Cockpit und Animus benötigen eine ausdrücklich gewählte Zimmer-Version. Keine automatische Auswahl. Neue Entwürfe ebenfalls; vorhandene Entwürfe ohne Zimmer bleiben gültig. Anfangs Zimmer 1, 2, 3.

`scribe_room_versions` enthält unveränderliche Versionen mit stabiler Zimmer-ID, Name, Aktivstatus, Ersteller und Zeitpunkt. Nur Praxisleitung (`admin`) darf über RLS eine neue Version hinzufügen. Scribe-berechtigte Mitarbeiter dürfen lesen. Kein Zugriff für `anon`, keine neue Rolle, kein Leitstand-Schema.

`doku_eintraege.zimmer_version_id` und `doku_eintrag_versionen.zimmer_version_id` sind eigene Fremdschlüssel. Migration 068 schreibt keine vorhandenen Einträge um. Bestehende `created_at`/`bestaetigt_am` bleiben erhalten; die Tages-API liefert jetzt beide sowie Zimmer-ID und historischen Namen. Eine Umbenennung verändert frühere Beschriftungen nicht.

## Auswirkungen und Sicherung

- Die drei bestehenden Schreibpfade bleiben erhalten: neuer Eintrag, vorhandener Entwurf, neue Version. Nur neue Einträge benötigen zwingend ein Zimmer.
- Direkte Datenbank-Inserts ohne Zimmer scheitern ebenfalls. Veraltete/deaktivierte Zimmer dürfen nicht für neue Einträge verwendet werden.
- Raumänderung bestätigter Einträge benötigt Versionssprung. Gleichzeitige Versionierung prüft zusätzlich die vorherige Version.
- Bestehende Scribe-Guard-Funktionen wurden live lesend abgeglichen und werden nicht verändert.
- Keine zusätzliche RPC-Funktion und keine EXECUTE-Freigabe. Neue Triggerfunktionen sind nicht öffentlich oder durch Clientrollen aufrufbar.
- Bekannte Bestandsgrenze: Eintrags- und Historieninsert sind zwei getrennte bestehende Anfragen. Ein Historienfehler wird jetzt sichtbar gemeldet, nicht als vollständiger Erfolg. Keine automatische Neuanlage.

## Tests vor Veröffentlichung

Gesamte vorhandene Testsuite einschließlich 42 RPC-Verträge grün. Neue PGlite-Tests prüfen Migration, Alt-Einträge, Pflichtfeld, Historienzuordnung, veraltete Zimmer, Rollenbeschränkung, ererbte Standardrechte und Rücknahme. Produktions-Schemacheck vor Änderung am 30.10.2026 02:45:52 UTC grün, Modulrolle nicht vorhanden. Produktionsbuild erfolgreich; finaler Wiederholungslauf nach Warnhinweis-Anpassung läuft.

Die Zimmerprüfungen sind in `npm test` eingebunden. Ausschließlich synthetische Testdaten in isolierter Datenbank. Keine Patienten-Testschreibvorgänge live.

## Rücknahme und Freigabegrenzen

Vorherige App bereitstellen, dann `scribe-rooms-068-rollback.sql` ausführen. Es deaktiviert nur die neue Zimmerpflicht; erfasste Zimmer und Historie bleiben erhalten. Keine Tabellen oder Patientendaten löschen.

Stand dieses Berichts: Code vorhanden, lokale Tests grün; Live-Migration, Deployment und Praxisabnahme noch nicht bestätigt. Kein neuer 48h-Beobachtungsbeginn. Workflow-Zeitgeber und Mail-Alarm sind ein separater nächster Schritt. Kein „Patient aufrufen“ für den Leitstand gebaut.
