# Genannte Kinder und zusammengesetzte Namen – 25.11.2026

## Befund (nur lesend geprüft)

Im gemeldeten Chat wurde das Kind ausdrücklich mit mehreren Vornamen und einem Nachnamen genannt. Zwei passende Patientenakten haben unterschiedliche Namenslängen, aber dasselbe Geburtsdatum. Seit dem 22.11. bestand in AnimaLine bereits eine bestätigte Verknüpfung mit der ausführlicher benannten Akte. Die AnimaHost-Entscheidung vom 25.11., 10:09 Berlin, protokollierte trotzdem `unmatched`, keine Kandidaten und ein leeres Patientenblatt (`unlinked`).

Ursache: `senderNameText` entfernt Angehörigen-/Kind-Sätze bewusst aus der **Absendersuche**. Der neue Retrieval-Pfad verwendete diesen bereinigten Text jedoch auch für die Patientenauswahl. Der vollständige Kindname wurde deshalb verworfen. Zusätzlich verlangte die globale Absendersuche sämtliche Bestandteile eines zusammengesetzten Nachnamens.

## Änderung

- Explizite Kindbezüge („mein/unser Sohn“, „meine/unsere Tochter“, „mein/unser Kind“ plus Name) werden gesondert als betroffene Person ausgewertet. Die schreibende Person und das Kind bleiben im Modellkontext getrennt.
- Mindestens ein Vorname **und** ein Nachnamensbestandteil liefern Kandidaten. Ein Vorname allein liefert keine globale Zuordnung. Zusätzliche Namensbestandteile verhindern die Kandidatensuche nicht.
- Eine eindeutig passende, schon bestätigte Telefon-/Chatverknüpfung wählt die betreffende Akte aus. Der Name allein bestätigt keine Identität und gibt keine vertraulichen Akten frei.
- Ohne solche Bestätigung führen mehrere Treffer oder nur ein unvollständiger Nachname zu einer Klärung. Haben mehrere passende Akten dasselbe Geburtsdatum, wird nicht sinnlos erneut nach diesem Datum gefragt. Die Akten werden weder zusammengeführt noch verändert.
- Eine ausdrücklich als Geburtsdatum genannte Angabe kann unterschiedliche Kinder trennen; ein Behandlungstermin darf nicht versehentlich als Geburtsdatum filtern.

## Prüfung

Der gemeldete historische Eingang wurde mit seiner vorherigen Historie und der vor Eingang bestehenden AnimaLine-Bestätigung lokal über `retrievalAnswer(..., readOnly:true)` erneut ausgeführt. Ergebnis: `matched`, `role=subject`, `source=phone`, `confirmed=true`, Patientenblatt `confirmed`; die ausgewählte ID entspricht der vorhandenen Bestätigung. Die Antwort fragt empathisch nach den geschätzten Minuten nach dem vereinbarten Termin. Kein Buchungslink, keine erneute Namensfrage, keine Rückmeldefrist und **kein Versand**.

Testdaten, Chat-ID, Patienten-IDs, Namen und Wortlaut bleiben in privaten Dateien außerhalb von Git. Im lokalen Lauf ist die Rechnungszustellquelle durch dieselbe dokumentierte Offline-Brücke wie beim Qualitätsvergleich eingeschränkt; dieser Test ist kein HTTP-Ende-zu-Ende-Test des Rechnungsdienstes. Die Namens- und Patientenblattabfragen lesen die tatsächlichen Quellen.

Regressionstests decken kurze/lange Namensvarianten, zusätzliche Vornamen, vorhandene Bestätigung, zwei bestätigte Kandidaten, fehlende Bestätigung, gleiches/abweichendes Geburtsdatum, Termindatum sowie den bisherigen Schutz gegen Vornamen-Zuordnung ab. Keine Datenbankmigration und keine Änderung bestehender Patientendaten.
