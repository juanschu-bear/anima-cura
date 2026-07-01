# AnimaSign / Ivoris Statusbericht

Stand: 2026-07-01
Repo: `anima-cura`

## Kurzfassung

- Das `[object Object]`-Problem beim Ivoris-Dokument-Push ist behoben.
- Die signierten PDFs sind in Anima-Cura direkt aus dem AnimaSign-Dashboard oeffenbar.
- Alte Test-/Schrottdaten wurden aus Supabase, Auth und Storage entfernt.
- Ein neuer Duplicate-Guard verhindert, dass fruehere AnimaSign-Ivoris-IDs blind noch einmal als neuer Patient angelegt werden.
- Ein zusaetzlicher Import-Guard verhindert jetzt auch, dass Ivoris-Dubletten blind als neue lokale `patients`-Zeilen in Anima-Cura gespiegelt werden.
- Es sind jetzt nur noch echte fachliche Ivoris-Klaerfaelle offen.

## Aktueller Systemstand

- `76/76` AnimaSign-Einreichungen sind `signiert`.
- `76/76` signierte PDFs liegen in Anima-Cura / Supabase Storage vor.
- `74/76` Patient-Syncs sind in Ivoris erfolgreich.
- `73/76` Dokument-Syncs sind in Ivoris erfolgreich.
- `71/76` Einreichungen sind in Ivoris komplett fertig.
- `5` echte manuelle Klaerfaelle sind offen.
- `0` normale Retry-/Queue-Faelle sind offen.

## Was erledigt wurde

### 1. Ivoris-Dokument-Push repariert

- Ursache war nicht die Base64-Konvertierung selbst, sondern die fehlerhafte Payload-/ID-Verarbeitung Richtung Ivoris.
- Der Dokument-Upload validiert jetzt die `PatientId` sauber und sendet keinen Objekt-Muell mehr.
- Der fehlerhafte Zustand mit `"[object Object]"` wird jetzt im Code abgefangen.

### 2. Sync robuster gemacht

- Manuelle Klaerfaelle werden jetzt explizit als `MANUAL_REVIEW` markiert statt endlos zu retrien.
- Mehrdeutige Ivoris-Treffer werden sauber getrennt von technischen Fehlern.
- Ein Admin-Override-Endpunkt fuer manuelle Ivoris-Zuordnung wurde bereits eingebaut.

### 3. Dashboard verbessert

- Das AnimaSign-Dashboard zeigt den Ivoris-Status verstaendlicher an.
- Es gibt jetzt eine eigene `PDF`-Spalte mit `Oeffnen`-Button fuer signierte PDFs.
- Der PDF-Zugriff ist ueber einen geschuetzten API-Endpunkt abgesichert.

### 4. Testdaten bereinigt

Am 2026-07-01 wurden vier alte Test-/Schrott-Eintraege komplett entfernt:

- Submission geloescht
- zugehoerige Storage-Dateien geloescht
- vorhandene Test-Auth-User geloescht

Entfernte Test-IDs:

- `46331e22-7e8c-45d6-9568-d6b72be9a92d`
- `8debe9cc-e3e5-47b3-9a1c-f8c44be339f9`
- `aed4682b-de29-493c-bfdb-e58e4eefe03e`
- `b8c1e75d-860f-4fb4-821b-f9b0650613b2`

Der Fake-Name `zguiuok hijop` / `hiob` ist damit nicht mehr in den Live-Daten vorhanden.

### 5. Duplicate-Guard gegen neue Ivoris-Dubletten

- Wenn fuer dieselbe Person bereits eine fruehere AnimaSign-Submission mit gueltiger `ivoris_patient_id` existiert, wird diese ID jetzt wiederverwendet.
- Wenn fruehere AnimaSign-Submissions fuer dieselbe Person auf mehrere unterschiedliche Ivoris-IDs zeigen, stoppt der Sync jetzt mit `MANUAL_REVIEW` statt noch einen weiteren Dubletten-Patienten anzulegen.
- Zusaetzlich bleibt die Ivoris-Verzeichnispruefung aktiv, um eindeutige bestehende Treffer wiederzuverwenden.

### 6. Scribe-Kreuzcheck / Tammo Kornelson

- Der Scribe-Doku-Flow legt keinen neuen Patienten an.
- `POST /api/doku/eintrag` erwartet eine bestehende `patient_id` und speichert nur einen Doku-Eintrag.
- `POST /api/doku/eintrag/[id]/ivoris-push` pusht nur einen Karteieintrag auf einen bereits vorhandenen `patients.ivoris_id`-Datensatz.
- Falls `ivoris_id` fehlt, bricht der Push mit Fehler ab. Es gibt dort keinen Fallback, der einen neuen Ivoris-Patienten erzeugt.

Konkreter Live-Befund fuer `Tammo Kornelson` am 2026-07-01:

- In `anamnese_submissions` existiert genau `1` Submission.
- In `doku_eintraege` existieren fuer Tammo `0` Scribe-Eintraege.
- In `patients` existieren lokal `4` Datensaetze mit vier verschiedenen `ivoris_id`-Werten.
- Diese vier lokalen Zeilen spiegeln bestehende Ivoris-Dubletten und wurden nicht durch Scribe-Dokumentation erzeugt.
- Zusaetzlich blockt der allgemeine Ivoris-Patientensync jetzt neue lokale Spiegel-Dubletten fuer identische Personendaten.

## Echte offene Klaerfaelle

### Dokument-Klaerfaelle in Ivoris

Diese Patienten haben ihr PDF in Anima-Cura, aber in Ivoris gibt es mehrere moegliche Zielpatienten:

1. `Tammo Kornelson` (`2005-07-11`)
   Submission: `80d97450-1d8e-4ac0-a15b-c68d19123309`
   Status: Patient in Ivoris vorhanden, Dokument noch nicht zugeordnet
   Grund: mehrere Ivoris-Treffer

2. `David Ngo` (`2016-08-01`)
   Submission: `bf989d6b-dc8e-4ae2-bcc8-0383f584d00e`
   Status: Patient in Ivoris vorhanden, Dokument noch nicht zugeordnet
   Grund: mehrere Ivoris-Treffer

3. `Lisa Werkmeister` (`1992-07-16`)
   Submission: `d03e3bf8-67ce-4156-bd0a-5514d056ff84`
   Status: Patient in Ivoris vorhanden, Dokument noch nicht zugeordnet
   Grund: mehrere Ivoris-Treffer mit identischen Stammdaten

### Patienten-Klaerfaelle in Ivoris

Diese Patienten haben ihr Dokument bereits in Ivoris, aber Ivoris blockiert das Kontakt-/Adressupdate:

1. `Emilia Lehmann` (`2012-08-16`)
   Submission: `7d0a8ceb-e32f-40e9-9b42-336e8dbddda1`
   Status: Dokument in Ivoris vorhanden, Stammdaten-Update blockiert

2. `Malak Aljadoua` (`2012-01-28`)
   Submission: `320dbd64-a926-4e34-846a-76e7d71052a6`
   Status: Dokument in Ivoris vorhanden, Stammdaten-Update blockiert

## Was in Anima-Cura jetzt sichtbar ist

- Im AnimaSign-Dashboard gibt es jetzt einen direkten PDF-Button pro Einreichung.
- Die PDFs liegen fuer alle `76` verbleibenden signierten Boegen in Anima-Cura vor.
- Das heisst: Sabine kann die signierten PDFs jetzt in Anima-Cura direkt aufrufen.

## Was noch ansteht

### Fachlich / manuell

1. In Ivoris fuer `Tammo`, `David` und `Lisa` den richtigen Dubletten-Datensatz festlegen.
2. Danach den Dokument-Sync gezielt auf den korrekten Ivoris-Patienten ausloesen.
3. Fuer `Emilia` und `Malak` die blockierten Kontakt-/Adressaenderungen in Ivoris manuell pruefen bzw. bereinigen.

### Technisch

- Es gibt aktuell keine normalen Retry-Faelle mehr.
- Offene Punkte sind nur noch echte Ivoris-Klaerfaelle.
- Die Cleanup-Route wurde zusaetzlich abgesichert, damit Testdaten-Bereinigung nicht offen von aussen aufrufbar ist.

## Relevante Code-Stellen

- Dashboard-Daten: `src/app/api/anima-sign/dashboard/route.ts`
- Dashboard-UI: `src/app/(dashboard)/animasign/page.tsx`
- PDF-Endpunkt: `src/app/api/anima-sign/submission/[id]/signed-pdf/route.ts`
- Testdaten-Cleanup: `src/app/api/anima-sign/cleanup/route.ts`

## Verifikation

- `next build` lief erfolgreich nach dem Dashboard-/PDF-Fix.
- Duplicate-Guard Tests am 2026-07-01 erfolgreich:
- Test 1: fruehere Submission-ID wird wiederverwendet, kein neuer Patient angelegt.
- Test 2: bei widerspruechlichen frueheren Ivoris-IDs stoppt der Sync sauber mit `MANUAL_REVIEW`.
- Test 3: der Ivoris-Import erkennt gleiche Person + anderes `ivoris_id` jetzt als Dubletten-Kandidaten und legt keinen neuen lokalen Patienten mehr an.
- Datenbankstand wurde am 2026-07-01 direkt gegen Supabase geprueft.
- Der Scribe-/Kornelson-Kreuzcheck wurde am 2026-07-01 direkt gegen Supabase verifiziert.
