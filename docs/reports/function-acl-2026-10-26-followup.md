# Dauerhafte Funktionsrechte und 48-Stunden-Beobachtung

## Versionierung

- Migration 062 dokumentiert die 88 bereits entzogenen Rechte an 31 Funktionen. Sie ist wiederholbar und erfindet keine fehlenden Alt-Funktionen.
- Vorher-/Nachher-Bericht: `function-acl-2026-10-26.txt`; Einzelrechte und geprüfte Leser: `function-acl-2026-10-26-manifest.json`.
- Das ursprüngliche Rückgängig-Skript bleibt unverändert erhalten. Es ist projektspezifisch und darf nie als automatische Fehlerbehebung ausgeführt werden.

## Standardrechte: genaue Reichweite und offener Punkt

Migration 063 entzieht für die tatsächliche Anwendungs-Migrationsrolle `postgres` die globalen FUNCTION-Standardrechte sowie die zusätzlichen Standardrechte im Schema `public`: PUBLIC, anon, authenticated und service_role. Neue Funktionen benötigen damit eine ausdrückliche Freigabe. Vorhandene Funktionsrechte bleiben davon unberührt.

PostgreSQL erlaubt keinen schema-lokalen Entzug eines globalen Standardrechts. Der globale Entzug betrifft deshalb auch künftig durch **postgres** angelegte Funktionen in anderen Schemas; er ändert weder bestehende Funktionen noch Standardrechte anderer Erstellerrollen. Quelle: [PostgreSQL ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).

**Nicht vollständig geschlossen:** Die verwaltete Erstellerrolle `supabase_admin` hat ebenfalls automatische Rechte. Eine zurückgerollte Befugnisprobe scheiterte mit SQLSTATE 42501 (`permission denied to change default privileges`). Diese Rolle oder ihre Mitgliedschaften wurden nicht geändert. Ihre offenen Standardrechte erscheinen ausdrücklich unter `platform_default_warnings`; ihre Schließung erfordert eine autorisierte Plattformänderung. Die vollständige Umsetzung von Punkt 2 ist deshalb noch nicht behauptet.

## Produktions-Schemacheck

`check:schema` ruft die nur für service_role freigegebene, lesende Funktion `function_acl_audit` auf. Alle nicht extensionsverwalteten Funktionen/Prozeduren in public werden geprüft. Ein PUBLIC-Zugang oder Modulrollen-Zugang zu nicht ausdrücklich als lesend/Guard geprüften Funktionen schlägt fehl. Auch neue, unbekannte Wrapper werden gesperrt; ein harmloser Name oder ein STABLE-Label genügt nicht. Die 17 geprüften Alt-Leser/Guards sind an ihre genaue Definition und ihren Eigentümer gebunden. Änderungen erfordern eine neue fachlich geprüfte Freigabe.

Die Modulrolle wird zusätzlich auf erhöhte Rechte, Mitgliedschaften und CREATE in public geprüft. Fehlende Modulrollen-Provisionierung wird ausdrücklich ausgewiesen, nicht als echte Rollenabnahme verkauft. Auch `billing_write` erhält durch diese Änderung keinerlei Modulrollenfreigabe. Ein späterer Übergabepfad muss die vereinbarte Datenbankgrenze einhalten.

Fehlende oder fehlerhafte Auditantworten, tatsächliche offene Funktionen und erneut geöffnete postgres-Standardrechte lassen den Schemacheck mit Fehlercode enden. Der bereits bekannte Systemrollen-Standard wird sichtbar gemeldet, aber blockiert nicht die bestehenden Sync-Worker; er ist kein gegenwärtiger Funktionsgrant und darf nicht durch eine scheinbare Reparatur des Workers verdeckt werden.

## Beobachtung ab morgen

Die an diesen Chat gebundene Automation `anima-cura-48h-rechte-livepr-fung` beobachtet vom **27.10.2026, 08:00 bis 29.10.2026, 08:00, Europe/Berlin**. Mangels bestätigter Öffnungszeiten ist das vorsorgliche Prüfungsfenster 08–18 Uhr; stündlich, einschließlich Abschlussprüfung. Dies sind 48 Zeitstunden, nicht 48 aufsummierte Arbeitsstunden. Die lokale Automation benötigt einen erreichbaren Ausführungsrechner und Zugänge; fehlender Logzugriff bleibt eine Abdeckungslücke.

Zu prüfen sind Datenbank-/API-Protokolle, Anamnese-/Scribe-Syncfehler, Outbox und Produktions-/Workerprotokolle auf permission denied, SQLSTATE 42501 und fehlendes EXECUTE. Ein leerer aktueller Fehlerzustand beweist keine vollständige historische Logabdeckung. Der nächste Prüfzeitstempel darf nur nach vollständig gelesener Quelle fortgeschrieben werden.

Eine Wiederherstellung erfordert einen **belegten regulären Vorgang**, exakte Funktionssignatur und tatsächliche Aufruferrolle. Nur das einzelne früher vorhandene Recht darf zurückkehren; keine PUBLIC-/Modulrollenfreigaben und kein Gesamtrücklauf. Jede Wiederherstellung braucht eine zusätzliche Migration, einen Nachweis und eine Nachricht an Juan. Fehlt administrative Ausführung oder eine erforderliche Bestätigung, bleibt sie gesperrt und wird als Blocker gemeldet. Die Automation stellt keine Erfolgsmeldung ohne Beleg aus und erzeugt keine Patiententestdaten.

Nach Ablauf folgt der Abschlussbericht mit tatsächlicher Abdeckung und offenen Lücken; anschließend geht der freigegebene Komplettbauauftrag weiter. Die 48-Stunden-Abnahme ist bei Einrichtung noch nicht erledigt.

## Aktivierung und Nachweise am 26.10.2026

- Migrationen 062 und 063 im richtigen Produktionsprojekt ausgeführt; SQL-Editor bestätigt Erfolg. Der anschließende vollständige Produktions-Schemacheck ist grün (18:03 UTC), 68 Anwendungsfunktionen, keine Funktions-/postgres-Standardrechtsverletzung. Die vier verwalteten Standardrechtswarnungen bleiben sichtbar.
- Beide angewandten Dateien sind zusätzlich im produktiven Migrationsregister mit dem vollständigen SQL hinterlegt. Die ausgelesenen MD5-Werte entsprechen exakt den Repo-Dateien: 062 `62e7200a3d3fd6740d8b1c35c673e8a0`, 063 `51d0fe144a3330ef73f34ec99f4e16cb`. Ältere Migrationsregistereinträge wurden nicht umgeschrieben.
- Eine ausschließlich transaktional angelegte und zurückgerollte Testfunktion hatte kein EXECUTE für PUBLIC, anon, authenticated oder service_role. Keine Patientendaten wurden erzeugt oder verändert.
- Beim ersten Audit wurde die bekannte Lesefunktion `match_szenarien` wegen unterschiedlicher Typqualifizierung beanstandet: Der sichere Suchpfad gibt `public.vector` statt `vector` aus. Die Definition ist nach genau dieser Typqualifizierung vollständig identisch zum Vorher-Snapshot. Die Freigabe verwendet nun die kanonische Prüfsumme `4dd047461579d97314c5c6dacd51fde4`; keine bestehende Funktionsdefinition wurde dafür geändert.
- `npm test`: 258 Tests erfolgreich, keine fehlgeschlagen. Produktionsbuild erfolgreich. Die sieben ACL-Tests prüfen wiederholbare Migration, neue Standardrechte, PUBLIC-Wrapper, Modulrollen-Mitgliedschaften, Definitionsänderungen und Dienstbeschränkung des Audits.
- Der bestehende Sync-Workflow führt `check:schema` planmäßig alle zehn Minuten aus; bei Fehler erstellt sein vorhandener Incident-Schritt einen zugewiesenen Betriebsalarm. Der neue Check ist zusätzlich Teil der Produktionsprüfung bei jedem Push.
- `scripts/check-permission-incidents.ts` sammelt gespeicherte Rechtefehler lesend, seitengenau und mit Vollständigkeitsprüfung. Beispiel: `npx tsx scripts/check-permission-incidents.ts --since=2026-10-27T07:00:00Z --until=2026-10-27T08:00:00Z --output=tmp/permission-incidents.json`. Kein Rohtext klinischer Nachrichten wird ausgegeben. Datenbank-/API- und Deploymentlogs sind zusätzlich zu prüfen; der Sammler behauptet keine Gesamtlogabdeckung.
- Basisabgleich 26.10., 15:00–18:02 UTC: alle fünf gespeicherten Quellen vollständig gelesen, zwei Outbox-Zeilen und keine erfassten Rechtefehler. Das ist keine positive Live-Abnahme aller vier Praxisabläufe und keine abgeschlossene 48-Stunden-Beobachtung.

Die Modulrolle existiert in Produktion noch nicht. Ihre spätere Provisionierung muss die geprüfte Grenze einhalten. Die offene Plattform-Standardrechtefrage benötigt weiter eine autorisierte Lösung; sie wird nicht mit einer Rolleneskalation umgangen.
