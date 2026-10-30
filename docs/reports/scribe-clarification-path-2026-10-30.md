# Scribe-Klärungsweg — 30.10.2026

- Genau verknüpften Eintrag per entry + patient öffnen, ohne Tagesauswahl zu ändern oder einen Nachsync auszulösen.
- Lesender Detailendpunkt: normale Sitzung/RLS, Scribe-Berechtigung, feste Patienten-/Eintragszuordnung, verworfene Einträge ausgeschlossen, private/no-store.
- Login erhält ausschließlich validierte lokale Eintragsziele.
- Bestätigten Originaltext mit Begründung über bestehenden Versionsendpunkt korrigieren. Zahnfelder und Positionen bleiben explizit unverändert; keine automatische fachliche Bestands- oder Abrechnungsbestätigung.
- Version und Patient vor dem Schreiben prüfen; bestehende Versions-CAS bleibt erhalten. Verworfene oder inzwischen geänderte Einträge werden nicht überschrieben.
- Teilfehler der bestehenden separaten Historienablage wird nicht als Erfolg ausgegeben. Die bestehende Architektur aus Update und anschließendem Historieneintrag bleibt eine bekannte Grenze; kein Schemaeingriff in diesem Auftrag.
- Bestehende vollständige Testsuite einschließlich 42 RPC-Verträgen grün. Vier neue Tests für Versionskonflikt, Patientenbindung, Altaufrufer und sichere Login-Rückkehr; dauerhaft in test:scribe-rooms eingebunden.
- Produktionsbuild grün. Keine echten Patientenfälle gespeichert, keine Worker manuell ausgelöst. Praxisabnahme offen.
- Nur eigene Dateien committen; fremde Änderungen an AnimaSign, Patientenportal und Zahlungen bleiben unangetastet.
