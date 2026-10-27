# AnimaSign Herzschlag und zusätzlicher Zeitgeber

Stand 27.10.2026. Konkrete Vorlage vor Einrichtung. Keine Zugangsdaten erzeugt, keine Cron-Konfiguration geändert. Ziel ist ein Alarm nach 25 Minuten ohne erfolgreich abgeschlossenen Schemacheck **und** abgeschlossenen Worker, auch wenn überhaupt kein GitHub-Lauf startet.

## Vorgeschlagenes Setup

| Baustein | Konfiguration |
| --- | --- |
| Zusätzlicher Start | Bestehendes Vercel-Projekt Anima Cura, Produktionsroute `/api/cron/animasign-dispatch`, alle zehn Minuten bei Minute 3, 13, 23, 33, 43, 53 UTC. Route mit bestehendem Cron-Bearer-Schutz; Ziel fest `juanschu-bear/anima-cura`, `animasign-sync-worker.yml`, `main`. Keine frei wählbaren Ziele, Eingaben oder Referenzen. Vercel-Tarif vor Einrichtung auf Minuten-Crons prüfen. |
| Doppelte Starts | Atomare Zehn-Minuten-Sperre in einer eigenen Betriebszustandstabelle; zusätzlich GitHub-Prüfung auf laufenden/queued Lauf. Bei unklarem Dispatch-Ergebnis nicht blind erneut starten. Bestehende Workflow-Concurrency bleibt bestehen. GitHub Schedule zunächst nur Rückfallweg; Abschaltung erst nach belegtem externen Takt. |
| Erfolgssignal | Workflow meldet nach erfolgreichem Schemacheck und regulärem Worker-Abschluss eine serverseitig geprüfte Quittung: Repo, Workflow, Run-ID, Commit, Zeit und Stufenergebnisse. Run-ID wird über GitHub nachgeprüft; bloßes HTTP 200, gestarteter Lauf oder `continue-on-error` zählen nicht als Erfolg. Keine Patienteninformationen. |
| Unabhängiger Alarm | Supabase Cron jede Minute, getrennt vom GitHub- und Vercel-Zeitgeber. Vergleicht ausschließlich den letzten verifizierten Abschluss mit der Datenbankzeit. Ab 25 Minuten ohne Abschluss ein Vorfall; einmalige Meldung und spätere Entwarnung statt Meldung pro Minute. Zum Start ohne gültigen Ausgangsnachweis sofort „Abdeckung fehlt“, kein erfundenes Grün. |
| Zustellung | Bestehender Betriebsalarm-/Mailweg an Juan, nicht an Patienten und nicht als Routinekopie an OrthoSchub. Konkrete verifizierte Empfängeradresse und vorhandenen Mailpfad vor Einrichtung festlegen. Fehlende Alarmzustellung ist selbst Fehler, nicht erledigter Vorfall. |
| Grenzen | Ausfall der Supabase-Datenbank kann den dortigen Watchdog selbst stoppen. Vercel prüft deshalb auch dessen Aktualität und meldet Datenbank-/Watchdog-Ausfall über den bestehenden Mailweg. Gleichzeitiger Ausfall beider Anbieter bleibt ohne weiteren Anbieter eine ausdrücklich verbleibende Lücke. |

Supabase Cron kann SQL und HTTP-Aufrufe zeitgesteuert ausführen; Vercel-Crons unterstützen geschützte Endpunkte, benötigen aber eine passende Tarifstufe und idempotente Verarbeitung. Quellen: [Supabase Cron](https://supabase.com/docs/guides/cron), [Vercel Cron-Verwaltung](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Zugangsdaten und notwendige Entscheidung

GitHub verlangt für `workflow_dispatch` die Repo-Berechtigung **Actions write**. Sie ist nicht auf „nur starten“ oder einen einzelnen Workflow einschränkbar. Ein Token mit exakt der gewünschten nativen Beschränkung existiert für diesen API-Weg nicht. Quelle: [GitHub Workflow Dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).

Vorschlag zur Prüfung: GitHub App nur auf diesem einen Repo installieren, ausschließlich Metadata read und Actions write, keine Contents-Schreibrechte oder weiteren Repos. Privater App-Schlüssel nur im geschützten Serverbereich; kurzlebiges Installationstoken, niemals im Browser oder in Logs. Der aufrufbare Start-Endpunkt erlaubt ausschließlich das oben festgelegte Ziel und hat keine allgemeine GitHub-Proxyfunktion. Lesezugriff auf Laufstatus ist zur Doppelstart- und Abschlussprüfung ebenfalls nötig und durch Actions write enthalten.

**Vor Einrichtung braucht es Juans ausdrückliche Zustimmung zum verbleibenden breiteren GitHub-Recht.** Der eng begrenzte Aufrufpfad ist eine zusätzliche Anwendungssicherung, keine native Einschränkung des Installationstokens. Ohne diese Zustimmung bleiben Token, Zeitgeber und Alarm unkonfiguriert. Keine Modulrolle und keine fachlichen Patientenschreibrechte für den Zeitgeber.

## Abnahme vor Aktivierung

Isoliert prüfen: 24:59 noch kein Ausfallalarm, ab 25:00 Vorfall; fehlender Lauf, fehlgeschlagener Schemacheck, hängender Worker und falsche Quittung erneuern den Erfolg nicht. Doppelte Cron-Aufrufe starten höchstens einen Lauf; Ausfall und Wiederherstellung erzeugen je eine Meldung. Live-Aktivierung erst nach Prüfung dieses Setups, getrennt protokolliert; kein zweiter manueller Workerstart aus der früheren Einmalfreigabe.
