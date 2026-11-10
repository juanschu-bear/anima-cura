# Scribe Schritt 1 — Productionstand 10.11.2026

## Code und Bereitstellung

Backend umgesetzt in `fec16a5`, Installationsvoraussetzung und Regressionstest in `d73be89`. Beide auf main. Production-Deployment `dpl_HgXPf2gFPcPGDVy4quy8fHuZEwp4` ist READY und auf `scribe.animacura.io` sowie `animacura.io` aliasiert.

Feste Bausteinschlüssel, unveränderliche Änderungshistorie, Undo/Redo und Zeitpunkt-Wiederherstellung; geschützte Abrechnungs-/Pflichtgruppen; relationale Inbox mit Revision, Ersteller-Löschung und Entwicklerstatusrechten; empfängerbezogene Glocke mit RLS und persönlichen Leseständen; dauerhafte Mailaufträge mit Provider-Idempotenz. Keine .tsx/.css-Änderungen, keine Änderungen an Patientendokumentation oder Zahlungen.

Claude-Vertrag: `docs/2026-11-10-scribe-zeitmaschine-glocke-contract.md`. Zeitmaschinenverwaltung, Glocke und neue Inbox-Berechtigungsanzeige bleiben UI-Aufgabe für Claude. Neuer Vorlagenmodus nur mit `history=1` und persistierter Versionsmarkierung; alter Cockpit-Modus bleibt kompatibel.

## Kontrollierte SQL-Installation

Der erste freigegebene 078-Versuch scheiterte an der fehlenden Voraussetzung `public.praxis_updates` aus 072 und wurde vollständig zurückgerollt. Vorherige Tests hatten diese Tabelle als Fixture vorausgesetzt. Der neue Regressionstest reproduziert den Fehler und Rollback.

Nach zusätzlicher ausdrücklicher Freigabe installiert: **079 → 078**, Prüfsummen jeweils unmittelbar vor Ausführung abgeglichen:

- `079_scribe_updates_prerequisite.sql`: `2407b27127a6c5fdff96ba0652d8841859bd476a987eebfd44fb301489c58b7e` — zwei Update-Tabellen, RLS, explizite Serverrechte; keine historischen Update-Meldungen.
- `078_scribe_time_machine_inbox_bell.sql`: `b3a7635e18533e3e6b403894cb49135cfe13b1b6e660eaefd92b2f79a312b600` — unverändert wie freigegeben.

Beide SQL-Ausführungen erfolgreich. Nach 079 beide Tabellen mit RLS, ohne anonymen Lesezugriff und ohne direkte Schreibrechte für App-Konten; Serverrechte vorhanden. Nach 078 alle neun neuen Tabellen mit RLS, ohne anonymen Lesezugriff und ohne direkte UPDATE-Rechte für App-Konten.

## Bestandsprüfung

- Vorher: 8 Infobox-Einträge, 2 ausdrücklich gespeicherte Statusereignisse, 0 Kommentare.
- Nachher: 8 importierte Einträge; alle 8 ursprünglichen JSON-Backups exakt gleich.
- 2.243 stabile Bausteinplätze angelegt.
- 200 archivierte Multiband-Praxistexte. Die ungefähr 80 heute gelöschten Texte lassen sich mangels früherem Löschprotokoll nicht eindeutig abgrenzen. Keine automatische Wiederherstellung.
- 0 wartende und 0 fehlgeschlagene Mailaufträge direkt nach Migration; keine historischen Benachrichtigungen erzeugt.

## Persönliches Juan-Konto

Auf ausdrücklichen Wunsch analog zu den vorhandenen internen Praxis-Anmeldeadressen angelegt: `juan@praxis-schubert.de`, Name Juan Manuel Schubert, Kürzel `js`, Rolle admin, keine Patientenzuordnung. Konto-ID `e5702286-8d03-4f4f-8220-92cefed44075`.

Productionvariable `SCRIBE_DEVELOPER_USER_ID` verweist ausschließlich auf dieses Konto. Kein bestehendes Praxisprofil verändert. Anmeldung per Passwort erfolgreich getestet; anschließend reale Anmeldung in Anima-Scribe im separaten Browser bestätigt. Die Inbox lädt. Kein Probeeintrag und keine klinische Dokumentation erzeugt.

Es handelt sich ausschließlich um einen App-Benutzernamen, nicht um ein Postfach. Kein Mailprovider eingerichtet. Zugangsdaten liegen lokal außerhalb des Repos in der dem Benutzer übergebenen Datei, mit Dateirechten 0600. Keine Passwörter im Repo oder Bericht.

## Tests und Grenzen

403 Tests im vorherigen Gesamtlauf bestanden; nach ergänztem Regressionstest alle 5 Scribe-Workspace-Tests bestanden. Diese prüfen Migration/Übernahme, Rollback, echte Update-Tabellen, Indexstabilität, Undo/Redo/Zeitpunkt, Hausregel, Status-/Rollenrechte, persönliche Lesestände und Mailauslösung. Production-Build erfolgreich, zusätzlich Production-Deployment READY.

Live-RPC-Audit: 53 Aufrufstellen geprüft. Alle neuen Scribe-RPCs vorhanden und passend berechtigt. Zwei bereits vorher fehlende Rechnungsdesign-Funktionen aus Leitstand-027 bleiben als Fehler gemeldet: `patient_invoice_document_edition(document_id uuid, original_only boolean)` und `patient_invoice_document_editions()`. Deshalb `npm test` insgesamt weiterhin nicht vollständig grün; keine Tests übersprungen oder gelockert.

Direkte Browsernavigation zur JSON-Inbox-API wurde vom eingebetteten Browser blockiert. Die bestehende Scribe-Oberfläche wurde mit Juans Sitzung erfolgreich geladen und die Inbox geöffnet; keine erfolgreichen schreibenden Production-API-Tests behauptet.

## Noch zu konfigurieren

`SCRIBE_INBOX_EMAIL_TO`: echte Empfängeradresse für Juans gewünschte Mailhinweise, laut Auftrag von Juan zu setzen. Noch nicht gesetzt, kein echter Mailversand getestet. Ohne Empfänger bleiben neue Mailaufträge wartend, ohne Versuche aufzubrauchen. Die interne Anmeldeadresse darf dafür nicht verwendet werden.

Optional `SCRIBE_SYSTEM_TOKEN` für Entwicklerautomatik; noch nicht gesetzt. Persönliche Entwicklerrechte sind bereits eingerichtet. Cron nutzt bestehenden `CRON_SECRET`.
