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

Gesamte vorhandene Testsuite einschließlich 42 RPC-Verträge grün. Neue PGlite-Tests prüfen Migration, Alt-Einträge, Pflichtfeld, Historienzuordnung, veraltete Zimmer, Rollenbeschränkung, ererbte Standardrechte und Rücknahme. Produktions-Schemacheck vor Änderung am 30.10.2026 02:45:52 UTC grün, Modulrolle nicht vorhanden. Produktionsbuild einschließlich Wiederholung nach UI-/Warnhinweis-Anpassung erfolgreich.

Die Zimmerprüfungen sind in `npm test` eingebunden. Ausschließlich synthetische Testdaten in isolierter Datenbank. Keine Patienten-Testschreibvorgänge live.

## Rücknahme und Freigabegrenzen

Vorherige App bereitstellen, dann `scribe-rooms-068-rollback.sql` ausführen. Es deaktiviert nur die neue Zimmerpflicht; erfasste Zimmer und Historie bleiben erhalten. Keine Tabellen oder Patientendaten löschen.

## Live-Nachweis

- Implementierungscommit `1c7080f`; isolierter Release auf origin/main `5dd05c936628ebfad31b8e51b0d218d3c760f771`.
- Deployment Ready: https://anima-cura-dl46ojcyn-juanschu-bears-projects.vercel.app . GitHub-Vercel-Status erfolgreich.
- Migration 068 live, exakte Register-/Repo-Prüfsumme `acd33a7d5b6376b52728e30086cedb24`. Beim ersten Registereintrag hatte die JavaScript-Ersetzung die Dollarzeichen im archivierten Quelltext verkürzt; ausschließlich dieser Registertext wurde hashgesichert berichtigt. Die ausgeführten Funktionen waren davon nicht betroffen.
- Live-Abfrage: drei Zimmer-Versionen, null nachträglich zugeordnete Einträge, keine Modulrolle. Neue Triggerfunktionen für anon/authenticated nicht ausführbar.
- Schemacheck nach Migration 30.10.2026 02:47:25 UTC grün, 72 Funktionen, keine Verletzungen. RPC-Nachprüfung: 42/42 grün.
- Live HTTP: `/scribe/login` und `/patient/anamnese` 200; `/api/doku/eintrag`, `/api/doku/heute`, `/api/anima-sign/import-reviews` ohne Anmeldung erwartungsgemäß 401.
- Angemeldete Browserprüfung nach Juans Anmeldung: Zimmer 1/2/3 werden geladen, Praxisleitungs-Verwaltung sichtbar. Keine echten Patienteneinträge zu Testzwecken angelegt. Kein Ersatz für fachliche Praxisabnahme.
- Responsive Messung der Scribe-Ansicht bei 390 und 768 Pixeln: Dokumentbreite entspricht Viewport, kein horizontaler Überlauf in `main`. UI-Nachbesserung: Zimmer direkt bei Patient/Behandlungsart, Scribe-Farbvariablen, Auswahlpfeil mit 12 Pixel Innenabstand und reservierter Textfläche, fehlendes Zimmer am Bestätigungsbutton sichtbar. Zimmerauswahl bleibt bei Wechsel der Behandlungsart erhalten, wird bei Patientenwechsel geleert.

## Nächster Blocker

`vercel env ls production` im verifizierten Projekt `prj_eg9lIA7SqjiZOtfhTnEX2SzJHrm7` zeigt `CRON_SECRET`, aber **kein** `ANIMASIGN_GITHUB_ACTIONS_TOKEN`. Den freigegebenen Dispatch daher nicht aktiviert. Token niemals in diesen Bericht oder Chat kopieren. Hinterlegung in diesem Projekt/Production und Bestätigung durch Juan erforderlich.

Der GitHub-Zeitplan bleibt unverändert dauerhaft bestehen. Mail-Heartbeat und dessen tatsächliche Zustellung sind noch nicht abgenommen. Kein neuer 48h-Beobachtungsbeginn. Kein „Patient aufrufen“ für den Leitstand gebaut, keine neue Rolle oder Leitstand-Schemaänderung.
