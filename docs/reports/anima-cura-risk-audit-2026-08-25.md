# Anima Cura Risk Audit

Stand: 25.08.2026

## Ziel

Produktive Fehlerquellen im Bereich Patienten-App, AnimaSign, Portal-Zuordnung und Revenue Intelligence sichtbar machen, dokumentieren und soweit direkt möglich absichern.

## Sofort gefundene Risiken

### 1. Revenue Intelligence zeigte erfundene System- und Praxisdaten

Betroffene Dateien:
- `/Users/oniokocentral/Documents/New project/anima-cura/src/app/api/praxis/intelligence/praxis/route.ts`
- `/Users/oniokocentral/Documents/New project/anima-cura/src/app/api/praxis/intelligence/system/route.ts`
- `/Users/oniokocentral/Documents/New project/anima-cura/src/app/(dashboard)/intelligence/page.tsx`

Risiko:
- Praxis und Systemtab zeigten Demo-/Mockwerte mit ausgedachten Patienten, Erfolgsquoten und Vorhersagen.
- Das ist operativ irreführend und kann Fehlentscheidungen auslösen.

Fix:
- Fake-Daten entfernt.
- Praxis-Metriken werden jetzt aus echten `patient_messages` berechnet.
- System-Metriken zeigen jetzt nur echten Reifegrad aus `patient_engagement`.
- Nicht-live-Bereiche werden explizit als noch nicht belastbar markiert.

### 2. Revenue-Intelligence-Ratenprofilierung griff auf falsche Schlüssel

Betroffene Datei:
- `/Users/oniokocentral/Documents/New project/anima-cura/src/app/api/praxis/engagement/route.ts`

Risiko:
- Raten wurden irrtümlich erst mit `ratenplan_id = patient_id` abgefragt.
- Dadurch konnte die finanzielle Risikologik unvollständig oder falsch rechnen.

Fix:
- Raten werden jetzt sauber über alle `ratenplaene` des Patienten geladen.
- `restschuld` wird aus echten offenen Raten dieses Patienten berechnet.

### 3. Lokale Patientendubletten konnten an versteckten Fremdschlüsseln hängen bleiben

Betroffene Datei:
- `/Users/oniokocentral/Documents/New project/anima-cura/scripts/repair-patient-duplicates.ts`

Risiko:
- Ein Merge konnte an Tabellen wie `doku_eintraege` hängenbleiben.
- Das hätte halbfertige oder blockierte Bereinigungen erzeugen können.

Fix:
- Referenzmatrix erweitert um echte produktive Tabellen wie `doku_eintraege`, `transaktionen`, `ki_analysen`, `behandlungsfall`.
- Produktivbereinigung durchgeführt.
- Lokale Patientendubletten in `patients`: aktuell `0`.

## Verbleibende bekannte Restpunkte

### A. Historische Submission-Dubletten in `anamnese_submissions`

Status:
- Historische Altlasten noch vorhanden.
- Neue identische Einreichungen werden jetzt serverseitig über einen Replay-Fingerprint und eine Pending-Reservation abgefangen.
- Betrifft damit aktuell vor allem alte Einreichungen, nicht mehr die laufende Submit-Kette.

Risiko:
- Mehrfach eingereichte Anamnesebögen können im operativen Blick weiter als Altlast auftauchen.

Fix:
- Auf `/api/anima-sign/submit` wurde ein dedizierter Idempotency-/Replay-Guard ergänzt.
- Logisch identische Einreichungen (gleiche Stammdaten, gleicher Inhalts-Fingerprint) werden innerhalb eines kurzen Fensters nicht erneut als neue Submission angelegt.
- Gleichzeitige Doppel-Submits werden über eine Pending-Reservation in `einstellungen` abgefangen.

Rest:
- Die bereits vorhandenen historischen Submission-Dubletten sind dokumentiert und bleiben vorerst als Altlast sichtbar, bis eine separate Bereinigungsrunde auch Storage-/Documenso-Referenzen mitberücksichtigt.

### B. Drei manuelle Ivoris-Review-Fälle mit Mehrfachtreffern

Status:
- Noch offen.
- Fälle mit identischen Stammdaten in Ivoris.

Risiko:
- Diese Fälle dürfen nicht automatisch neu angelegt werden.

Empfehlung:
- Manuelle Zuordnung in Ivoris abschließen und den finalen `ivoris_patient_id` sauber zurückschreiben.

## Prüfungen

Für diesen Auditlauf relevant:
- `npm run build`
- `npm run verify:prod`
- `npm run check:animasign`

## Ergebnis

Die wichtigsten akuten Schwachstellen in diesem Lauf waren nicht theoretisch, sondern konkret:
- irreführende Fake-Intelligence
- fehlerhafte Finanzprofilierung
- unvollständige Dubletten-Referenzbereinigung

Diese Punkte sind in diesem Lauf direkt bereinigt oder abgesichert worden.
