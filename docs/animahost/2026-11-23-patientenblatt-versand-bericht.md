# Patientenblatt und asynchroner Versand — Ergänzungsbericht
23.11.2026. Alle Testnamen sind erfunden. Kein WhatsApp-Versand im Test.

## Änderungen
- Keine Nachtpause; Versand rund um die Uhr. Persistente Versandplanung mit 30–90 Sekunden, Notfallziel 10–15 Sekunden, Lese-/Schreibzeit und Zufallsstreuung. Neue Nachricht ersetzt wartende Antwort und führt die noch unbeantworteten Nachrichten zusammen. Neustart behält wartende Pläne; unklar begonnener Versand wird nicht wiederholt.
- Antwortkern: 60 Sekunden Budget, Denkphase für Entwurf, bis zu zwei Nachbesserungen. Laufzeit ist ausschließlich Technikwert.
- Patientenblatt nur lesend und für vertraulichen Kontext nur nach bestätigter Identität. Mehrere Kinder werden nicht willkürlich auf eines reduziert. Feldbelegung wird je Antwort dokumentiert.
- Namensabgleich gegen Patienten und Eltern: Signaturen, vertauschte und Zweitnamen; ein Treffer wird vorläufig gespeichert, mehrere führen zur Geburtsdatumsfrage. Bestätigung/Lösen durch das Team. Kein Überschreiben der Stammdaten.
- Deutsche Schreibweise und interne Feldnamen werden im Kern und unmittelbar vor geplantem Versand geprüft.
- Bei Apparaturfragen wird `ablauf-spontan` zusätzlich abgerufen, sofern freigegeben; Entwürfe ausschließlich im entsprechenden Probelauf.

## L26: kontrollierter Vorher/Nachher-Modelltest
Gleiche erfundene Draht-/Donnerstagsnachricht, einmal ohne, einmal mit bestätigtem Patientenblatt und vorhandenem Termin. Kein Ersatz für den gesamten historischen Abnahmelauf.

### Ohne Patientenblatt

Guten Morgen, danke für Ihre Nachricht. Ich gebe Ihren Wunsch für Leon mit dem wohl abgebrochenen Draht und dem Termin am Donnerstagnachmittag an unser Team weiter. Ihre Rückmeldung erhalten Sie heute noch. Einen Termin bestätige ich Ihnen erst, wenn er tatsächlich eingetragen ist. Falls Leon Schmerzen hat oder sich der Draht stark lockert, rufen Sie uns bitte direkt unter 4915100000001 an.

Technikwert: 13824 ms; Nachbesserungen: 1.

### Mit Patientenblatt

Guten Morgen, das tut mir leid, dass bei Leon ein Draht abgebrochen ist. Leon hat bereits einen Termin am Donnerstag, den 26.11.2026, um 15:30 Uhr, den wir dafür nutzen können, den Draht dort mit anzusehen. Ich gebe Ihren Wunsch nach einem Donnerstagnachmittag an das Team weiter, das sich dazu heute noch bei Ihnen meldet. Sollte der Draht stören, drücken oder Leon Schmerzen bereiten, rufen Sie uns bitte sofort unter 04915100000001 an.

Technikwert: 6302 ms; Nachbesserungen: 0.

Der Termin aus dem Patientenblatt verändert die Antwort nachweisbar: Donnerstag 26.11., 15:30 Uhr wird genannt und der Draht kann dort angesehen werden. Die Formulierung zur telefonischen Rückmeldung und Telefonnummer ist in diesem kleinen Modelltest noch nicht als Praxisabnahme bewertet.

## Prüfungen und Grenzen
113 AnimaHost-Tests, 63 AnimaLine-Tests, 303 Leitstand-Tests bestanden; Builds bestanden. Versandplanung mit echter lokaler PostgreSQL-Ausführung geprüft: Ersetzen, veraltete Erzeugung, einmaliger Versandanspruch, Rechte und unklarer Versand nach Neustart. Migration 106 lokal auf Syntax und Rollen geprüft; Produktiver RPC-Rechtecheck: 74 Aufrufstellen, keine Verstöße.
Die gesamte Chat-Historie wird gelesen und nach Anliegen zusammengefasst, einschließlich Nachrichten-/Tageszahlen und Beispielen. Diese Zahlen zählen Nachrichten/Tage, nicht bewiesene einzelne Defekte. Fehlende Daten bleiben als nicht verfügbar markiert. Apparatur stammt aus vorhandenen Behandlungsfeldern, nicht aus einem neu erfundenen Befund.
Die vorhandenen 51 Wissenseinträge bleiben Entwurf. Live darf `ablauf-spontan` deshalb erst nach Freigabe genutzt werden. Kein erneuter 239-Fälle-Gesamtlauf in dieser Ergänzung; der frühere Abnahmebericht bleibt maßgeblich. Keine Aktivierung der neuen Production-Schalter.

## Eingespielte Migrationen

- `106_animahost_chat_identity.sql`: SHA-256 `218dc5d62897426ce9d848fb6dd51e4634dabcf31ad218353110a96c88f7126b`.
- `20261123170000_planned_replies.sql`: SHA-256 `b69d6f76489af46394c469f0bd41cc6c89dac9ce4965da839c88e40acff156a3`.
