# AnimaHost: Namen, mehrere Anliegen und persönliche Ansprache

## Verhalten

- `styleMessage` ergänzt keine generischen Namensvorsätze mehr. Patientennamen stehen nur in fachlichen Antwortvorlagen, wenn der ausgewählte Patient tatsächlich feststeht.
- Ein ausdrücklich genannter Patient hat Vorrang vor der Standardzuordnung einer Telefonnummer. Bei mehreren Treffern wird niemand angenommen. Ein nicht zuordenbarer ausdrücklich genannter Name wird mit allen Anliegen ans Team übergeben; die Antwort nennt keinen vermuteten Patienten.
- Begrüßungsregeln stehen für Nachrichten mit konkretem Inhalt weder der Modellklassifikation noch der deterministischen Ersatzregel zur Verfügung.
- Ein Terminwunsch zusammen mit einer Rechnungsfrage führt beide Wege aus: freigegebene Terminantwort und Rechnungsprüfung. Bei einem Prüfungsfehler bleibt die Terminantwort erhalten und die Rechnung geht zur Klärung ans Team. Die Antwort bestätigt keine tatsächlich erfolgte Kalenderänderung.
- Mehrere vom Klassifikator sicher erkannte freigegebene Textregeln werden zusammengeführt. Ein vorhandener Haupttext unterdrückt zusätzliche passende Antworten nicht mehr.
- Persönliche Ansprache an ein Teammitglied führt vor patientenspezifischen Abläufen zur vollständigen Teamübergabe. Notfall und Kontaktstopp behalten Vorrang.
- Wiederholte persönliche Nachrichten bekommen eine Bestätigung der Ergänzung statt der unzutreffenden Aussage, der Assistent komme nicht weiter.

## Vertrag für Leitstand / Claude

Zusätzliche optionale Felder in `details` / gespeichertem `case_details`:

- `requestedName: string | null`: ausdrücklich genannter Name, ohne ihn einer unbekannten Akte zuzuweisen.
- `concerns: string[]`: erkannte Anliegen, derzeit `appointment` und `invoice`.
- `practiceSummary: string`: Themenübersicht plus vollständige ursprüngliche Nachricht einschließlich Daten und Uhrzeiten.

Regeln: `quality:personal_team`, `identity:unmatched_subject`, `quality:multiple_concerns`. Aktion `klaerfall`, daher aktuelle Teamfälle. Die Praxisbenachrichtigung übernimmt die vollständige Zusammenfassung. Der reale bestehende Chat wurde durch die Prüfung nicht geändert; die Felder entstehen für neue Entscheidungen.

## Tests

56 AnimaHost-Tests bestanden, darunter sieben neue Regressionstests mit vollständig erfundenen Namen, Nachrichten und Kennungen. Abgedeckt sind die vier beauftragten Fälle, fehlgeschlagene Rechnungsprüfung sowie persönliche Folgemeldungen. Bestehende Erwartungen an generische Namensvorsätze wurden an die neue Vorgabe angepasst. Production-Build und die vier Prüfungen für Praxis-Neuigkeiten erfolgreich.

## Lesender Replay des heutigen Chats

Die zwei gespeicherten eingehenden Nachrichten von **22.11.2026, 09:10:26 und 09:11:12 Europe/Berlin** wurden lesend aus AnimaLine geladen und lokal durch dieselben Funktionen für Patientenauswahl, persönliche Übergabe, Stil und abschließenden Wiederholungsschutz geprüft. Keine Kopie des Originaltexts oder der Patientenkennungen wird versioniert.

09:10: Beide Anliegen `appointment` und `invoice` erkannt. Der ausdrücklich genannte Name lässt sich nicht einem verknüpften Patienten zuordnen. Wegen der persönlichen Teamansprache greift `quality:personal_team`; die komplette Nachricht mit Terminwunsch, Datum, Zeitfenster und Rechnungsproblem bleibt in der Zusammenfassung. Keine patientenspezifische Rechnungsprüfung gegen eine andere Akte.

Neue Antwort:

> Ich gebe Ihre vollständige Nachricht mit allen Anliegen an das Team weiter. Es meldet sich am Montag, 23. November bei Ihnen.

09:11: Die Ergänzung wird ebenfalls als persönliche Teamnachricht behandelt. Beim fortlaufenden Replay berücksichtigt der Wiederholungsschutz die neue erste Antwort:

> Ihre Ergänzung von 09:11:12 gebe ich ebenfalls vollständig an unser Praxisteam weiter. Es meldet sich am Montag, 23. November bei Ihnen.

Der Replay führt weder den schreibenden HTTP-Endpunkt noch einen Versandweg aus: **0 Datenbankänderungen, 0 Nachrichten versendet**. Es ist ein lokaler Replay mit echten, nur lesend geladenen Eingaben, kein Versandtest in Production und keine nachträgliche Änderung der bereits gespeicherten Antworten.
