# AnimaSign Pflichtfelder und dauerhafte Prüffälle

Stand 27.10.2026. Code lokal vorhanden und isoliert getestet, **nicht live und nicht mit echten Praxisfällen abgenommen**. Freigabe für Produktion erst nach 18:00 Europe/Berlin am 27.10.2026; kein bestehender Patientendatensatz, keine echte Einreichung und kein vorhandener Prüfstatus wurde geändert.

## Änderungen

- Der IVORIS-Sammelimport trennt Zeilen mit fehlendem oder ungültigem Geburtsdatum vor dem Patienten-Upsert ab. Sie landen ohne erfundenes Datum in `patient_import_reviews`; gültige Zeilen laufen durch den bisherigen Identitäts- und Importpfad. Auch der Cron-Gesamtbericht zählt zurückgestellte Zeilen separat. Fehler beim Speichern eines Prüffalls brechen sichtbar ab; die Zeile wird nicht still verworfen.
- Die Praxis sieht offene Importfälle unter AnimaSign, 15 je Seite, mit Praxis-ID und verständlichem Grund. Eine erfolgreiche spätere Verarbeitung einer gültigen Quellzeile schließt nur deren Importfall. Kein rückwirkendes Sammel-Replay.
- Der Formularserver prüft Pflichtfelder und kalendarisch gültiges Geburtsdatum vor Datenbankzugriff/RPC. Minderjährigen-/Versicherten-/Zahlerfelder bleiben bedingt erforderlich, freiwillige Einwilligungen bleiben freiwillig. Fehler 422 markiert die betreffenden Felder bei erhaltenen Eingaben.
- Offene Anamnese-Prüffälle werden unabhängig vom 30-Tage-Fenster über alle Datenbankseiten geladen und mit 15 Fällen je UI-Seite angezeigt. Der zeitliche Filter bleibt nur bei separaten Duplikat-Vorschlägen. Ladefehler sind sichtbare Fehler, keine leeren Erfolgsliste.

Die Migration `065_patient_import_reviews.sql` ergänzt nur eine Tabelle mit RLS; PUBLIC, anon und authenticated haben keine direkten Rechte, service_role nur SELECT/INSERT/UPDATE. Der neue Lese-Endpunkt verlangt zuvor admin oder verwaltung. Keine neue Funktion, kein EXECUTE-Grant und keine Modulrolle. Der RPC-Dateihash des Formularservers wurde nach Prüfung des reinen Validierungsdiffs aktualisiert; Rollen und RPC-Aufrufe bleiben unverändert.

## Prüfungen

- Vollständiges Cura `npm test` bestanden, einschließlich 42 RPC-Verträge. Neue Tests: Kalender-/Pflichtfelder, gültige und ungültige Importzeilen, Persistenzfehler, mehr als 500 alte offene Fälle und additive Migration mit verweigerten Clientrechten in isolierter PGlite-Datenbank.
- `npm run typecheck` und `npm run build` bestanden.
- `npx tsx scripts/test-import-review-ui.ts`: isolierter Browser mit synthetischen Namen, Desktop 1280 und Mobil 390 Pixel, Fehler/Wiederholen, 15er-Seiten, HTML-Escaping und kein horizontaler Überlauf bestanden. Kein Login oder Datenbankzugriff. Screenshots lokal unter `tmp/intake-review-ui`.
- Impeccable-Härtung: bestehender Stil erhalten, Fehler-/Ladezustände, Tastaturfokus und lokalisierte Texte ergänzt. Detektor meldet 17 vorhandene Schrift-Befunde im Anamneseformular; keine neue Schrift eingeführt. Kein zusätzlicher Design-Umbau im Fehlerfix.

## Release nach 18 Uhr

1. Eigener Commit ausschließlich dieser Änderungen; vorhandene fremde Arbeitskopie-Änderungen nicht übernehmen. Kein vorzeitiger Push auf den automatisch deployenden main-Zweig.
2. Nach 18 Uhr aktuelle Produktionsbasis und Migration 065 prüfen. Nur 065 über bestätigten administrativen Zugang anwenden, kein pauschales `db push` aus der gemischten Arbeitskopie. Fehlender administrativer Zugriff ist ein Release-Blocker.
3. Tabelle und Rechte zurücklesen, dann genau diesen App-Commit deployen. Kein schreibender Workerstart oder Nachverarbeiten bestehender Daten zur Prüfung. Produktions-Schemacheck, RPC-Verträge und lesende API-Prüfung durchführen, reguläre Praxisvorgänge beobachten.
4. Tatsächliche Commit-ID, Deployment/Migrationszeit, Rechte-/Schemaergebnis und eventuelle Abdeckungslücken in den 48-Stunden-Abschlussbericht aufnehmen. Bis dahin bleibt der Release als ausstehend markiert.

Rücknahme: vorherige App-Version wiederherstellen; die neue Prüftabelle mit sämtlichen inzwischen entstandenen Fällen erhalten, nicht löschen oder leeren. Keine Patientenänderung zurückzunehmen. Bei Rücknahme können Importprobleme wieder auftreten; Betriebsvorfall deshalb offen halten. Kein vollständiges Rechte-Rollback und keine Änderung an Vorschlag B.
