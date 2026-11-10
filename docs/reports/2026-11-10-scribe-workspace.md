# Scribe Schritt 1 — Backendstand 10.11.2026

## Code

Auf main-Stand `0429591` aufgebaut. Neues Backend für feste Bausteinschlüssel, unveränderliche Änderungshistorie, Undo/Redo und Zeitpunkt-Wiederherstellung; geschützte Abrechnungs-/Pflichtgruppen; relationale Inbox mit optimistischer Revision, Ersteller-Löschung und Entwicklerstatusrechten; empfängerbezogene Glocke mit RLS und persönlichen Leseständen; dauerhafte Mailaufträge über bestehenden Mailweg mit Provider-Idempotenz und Wiederholung. Keine .tsx/.css-Änderungen, keine Änderungen an Patientendokumentation oder Zahlungen.

Datenvertrag: `docs/2026-11-10-scribe-zeitmaschine-glocke-contract.md`.

## Bestandsprüfung, nur lesend

- 8 Infobox-Einträge: 6 `bestaetigt`, 1 `fix_in_arbeit`, 1 `praxis_bestaetigt`.
- 2 ausdrücklich gespeicherte Statusereignisse, 0 Kommentare.
- 200 inaktive Multiband-Praxistexte. Die ungefähr 80 heute gelöschten Texte lassen sich aus diesen Bestandsdaten nicht eindeutig abgrenzen. Alle vorhandenen inaktiven Texte werden angeboten; keine automatische Wiederherstellung.
- Die bisher bekannte Betreiber-ID gehört im Profil Dr. Maria Schubert. Kein Juan-Profil unter dem Namen Juan oder der bisher genannten Beispiel-Mailadresse gefunden. Entwicklerkonto beim Benutzer nachgefragt; keine stillschweigende Freigabe für alle Admins.

## Tests

403 Tests im Gesamtlauf bestanden. Darin 4 neue PostgreSQL-/Domänentests mit zahlreichen Prüfungen für Migration, Indexstabilität, Archivtexte, Rückgängig/Wiederherstellen, Rechte, Status, Kommentare, Benachrichtigungen, Mail-Warteschlange und Wiederholung. Nach zusätzlichen Randfallprüfungen erneut 4/4 bestanden. Bestehende 65 Scribe-Tests bestanden. Abschließender Production-Build erfolgreich.

`npm test` insgesamt noch nicht grün: abschließender Live-RPC-Audit meldet die vier noch nicht installierten Funktionen aus 078 sowie die zwei bereits vorher fehlenden Rechnungsdesign-Funktionen aus Leitstand-027. Keine Prüfung übersprungen oder gelockert. Source-/Rollenverträge der neuen RPC-Aufrufe sind geprüft und versioniert.

## SQL / Bereitstellung

Vorbereitet, **nicht in Production installiert**:
`supabase/migrations/078_scribe_time_machine_inbox_bell.sql`

SHA-256: `b3a7635e18533e3e6b403894cb49135cfe13b1b6e660eaefd92b2f79a312b600`

Einspielen und Nachprüfung erst nach ausdrücklicher Prüfsummenfreigabe gemäß Auftrag. Die Migration übernimmt das alte Inbox-JSON, friert weitere Schreibzugriffe darauf ein und schränkt direkte Vorlagenänderungen ein; alle Änderungen gehen anschließend durch die API. Ein rückwärts laufendes altes Backend darf danach nicht mehr die JSON-Inbox schreiben. Deshalb SQL und Deployment unmittelbar hintereinander im kontrollierten Rollout, nicht getrennt über längere Zeit.

Lesende Nachprüfung vorbereitet in `scripts/verify-scribe-workspace.sql`: genaue Übernahme des Legacy-Backups, Objekt-/Funktionsrechte, RLS und Aggregate ohne medizinische Texte.

Deployment auf Production wird bis zur Installation zurückgehalten, damit bestehende Inbox-Schreibwege nicht wegen fehlender Tabellen/Funktionen ausfallen. UI und Backend müssen für die Zeitmaschine `history=1` sowie die persistierte Versionsmarkierung gemeinsam verwenden. Details im Vertrag.

## Konfiguration und Sichtbarkeit

`SCRIBE_INBOX_EMAIL_TO` setzt Juan für die Empfängeradresse. `SCRIBE_DEVELOPER_USER_ID` wird erst nach Benennung seines tatsächlichen Login-Kontos gesetzt. Optional eigener serverseitiger `SCRIBE_SYSTEM_TOKEN` für Entwicklerautomatik; Cron verwendet bestehenden `CRON_SECRET`. Ohne Mailadresse bleibt der Auftrag wartend, ohne erfolglose Versuche aufzubrauchen.

Noch keine neue Praxisoberfläche ausgeliefert. Claude baut Zeitmaschinenverwaltung, Glocke und Infobox-Anpassung anhand des Vertrags. Keine echte Testmail verschickt. Bis zur SQL-Freigabe und Bereitstellung bleiben die bisherigen Production-Funktionen unverändert.
