# Zimmer-Dropdown, 30.10.2026

Ursache: Der klassische Scribe-Picker erhielt `disabled` solange kein Patient gewählt war. Das Zimmer darf vor der Patientenauswahl gewählt werden; eine laufende Speicherung sperrt weiterhin. Die erste Patientenauswahl bewahrt die explizit getroffene Zimmerwahl. Ein bewusster Patientenwechsel setzt sie weiterhin zurück. Keine Lockerung der serverseitigen Pflichtfeldprüfung.

Auf Juans Auftrag wurden über die bestehende Praxisleitungs-Zimmerpflege drei neue Katalogversionen gespeichert und anschließend in der Oberfläche verifiziert: Zimmer 1 (Blau), Zimmer 2 (Rot), Zimmer 3 (Grau). Bestehende Einträge und ihre historischen Zimmerbezüge bleiben unverändert. Keine Einträge zu Testzwecken erstellt.

Geprüft: drei Zimmer-Testgruppen inklusive neuer Regression, Produktionsbuild erfolgreich. Live-Bedienprüfung folgt auf Deployment des isolierten UI-Fixes.

Leitstand: Anmeldung mit bestehendem Praxisprofil erfolgreich. Tagesfilter 30.10. frühmorgens liefert keine sichtbaren Scribe-Einträge; 29.10. liefert 27 echte Einträge auf zwei Seiten (15 + 12). Historische Einträge ohne Zimmer werden korrekt als unbekannt angezeigt. Das ist keine Abnahme des vollständigen Leitstands.
