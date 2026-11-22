# Bericht an Juan: Rechnungszugriff, 22.11.2026

## 1. Produktion repariert; ergänzende Audit-Migration bereit

Juan/Claude melden `099_invoice_portal_visibility.sql` als eingespielt in **Anima Cura**, `zymqxzhjbcxzhzvjqvbv`. Die aus Git geladene Datei hat exakt die gemeldete SHA-256 `29383f2239d97b213cd81058e81101ae4fd7c1a082fe1e6276167597d7c54491`. Sie bleibt unverändert. Meine zwischenzeitlich vorbereitete alternative Reparatur wurde zurückgezogen.

**Noch einzuspielen:** `supabase/migrations/100_invoice_portal_function_audit.sql`, Laufname **invoice-portal-audit-after-099-2026-11-22**. SHA-256: `9e7524fa4794c18314a16209c06d85b1a325d8640e35f9c94e61c41ee2e17ef8`.

100 prüft die exakten Definitionen aus 098/099 und zieht den Audit aus 082 für die fünf ersetzten Patientenfunktionen und sechs neuen/zusätzlichen Helfer nach. Außerdem repariert sie die alte sechste Funktion `patient_invoice_documents()`, die 099 nicht ersetzte: auch sie verwendet danach den vorhandenen JWT-Helfer statt `auth.uid()`. Keine zusätzlichen Laufzeitrechte auf `auth`, unveränderte Legacy-ACLs und Eigentümer. Projektprüfung, erneuter Lauf und atomarer Abbruch bei Abweichung sind getestet. Andere Audit-Verstöße werden nicht freigegeben.

Lesender Live-Audit nach 099: elf Rechnungsfunktionen sind wegen der alten Definitionen/fehlenden Einträge noch `module_unreviewed_execution`. Genau diese Einträge adressiert 100. Die Prüfung der API-RPC-Verträge hatte zusätzlich eine falsch formatierte Signatur beim neuen AnimaHost-RPC: die Leerzeichen zwischen benannten Argumenten fehlten. Sie sind korrigiert; der Audit vergleicht diese Signaturen als exakte Zeichenketten.

100 ist noch nicht in Production ausgeführt. Im SQL-Editor als Ganzes ausführen; nur eine fehlerfreie Ausführung mit abschließender Ergebniszeile zählt als Installation. Repo-Vorgabe: neue Migrationen vor dem Einspielen mit Prüfsumme vorlegen. Es wurden keine Zugangsdaten weitergegeben oder verändert.

## 2. Produktionsnachweise und dauerhafter Test

Von Juan/Claude gemeldete, zurückgerollte Simulationen mit echten Nutzerzuordnungen, `request.jwt.claims` und Rolle `authenticated`:

| Fall | Belege / Editionen | PDF |
| --- | --- | --- |
| Einzelpatient | 3 / 3 | lädt; typeset |
| Elternteil/Geschwister | 6 / 6 | lädt; typeset |
| Mitgliedschaft mit anderem Profilpatienten | 6 / 6 | lädt; typeset |
| Live-Fall 22.11., 06:36 | 3 / 3 | lädt |

Vor 099 scheiterte derselbe Weg mit dem Schemafehler. Familien- und Mitgliedschaftsprobe könnten derselbe Login gewesen sein; ein **zweiter unabhängiger Familienlogin bleibt live nachzuprüfen**. Das sind SQL-Sitzungsnachweise, keine hier durchgeführte Browser-Abnahme.

`node scripts/test-patient-invoice-authenticated.mjs` installiert jetzt die **unveränderte 099** und die neue 100 in PostgreSQL 17, mit nicht privilegiertem Installer, eingeschränkter Modulrolle und aktivierter RLS. Vor der Reparatur scheitern alle sechs alten Funktionen mit dem bekannten Fehler. Danach bestehen **vier verschiedene synthetische Konten**: Einzelpatient, zwei unabhängige Familien und ein nur über Mitgliedschaft erreichbarer Rechnungsbestand. Geprüft werden Liste, Editionen, Original-PDF und typeset-PDF unter `authenticated`, Fremdzugriffssperre, leere/falsche Claims, Rollenrechte sowie Vorprüfung und AnimaHost. Kaputtes typeset fällt auf das Original zurück; sind beide kaputt, wird die Vorprüfung `pdf_unavailable` und AnimaHost `manual_review`. Keine neuen Schema-Rechte; Audit-Fingerabdrücke, Wiederholung und Rollback werden geprüft. Der Test läuft künftig in Production Verify vor den übrigen Tests.

Zusätzliche Browser-API-Abnahme möglich mit `scripts/verify-patient-invoice-sessions.mjs`: drei bestehende autorisierte Sitzungen über die echten App-Routen, vollständiger PDF-Download und PDF-Parser. Private Konfiguration über `INVOICE_SESSION_CASES_FILE`; keine Cookies oder Patientendaten in Git/Ausgabe. Dieser Test wurde mangels Sitzungen nicht ausgeführt.

## 3. Ausfallbeginn und Erkennung

Der genaue Ausfallbeginn ist nicht belegt. Migration 022 vom 06.11. enthielt explizit `USAGE ON SCHEMA auth` und `EXECUTE ON auth.uid()`. Die Benachrichtigung vom 13.10. liegt vor diesen Modul-RPCs; ihre zeitliche Nähe ist kein Beweis für denselben Fehler seit Oktober. Es fehlt der Produktionsnachweis, wann die Rechte entzogen oder anders installiert wurden.

Die Erkennungslücke ist nachvollziehbar: 082 prüft Definitionen und Ausführungsrechte, aber führt die Funktionskörper nicht als Patient aus. Der alte PostgreSQL-Installationstest prüfte die Rollenrechte und einen unzulässigen Zugriff, jedoch keinen erfolgreichen Patientenabruf. Die Listenroute setzte beim RPC-Fehler bereits `belegeStatus=unavailable`, lieferte aber eine leere Belegliste. Der PDF-Helfer deutete jedes `42501` als Patientensperre, auch den Schemafehler.

Neu: ausdrücklicher Verfügbarkeitsvertrag, HTTP 503 bei technischen PDF-Rechtefehlern, datensparsame Fehlerprotokollierung tatsächlicher Listenabrufe und eine geschützte Health-Route für die Praxiswarnung. Details im ergänzten Vertrag. Die sichtbare Anzeige und der Leitstand-Aufruf bleiben bei Claude.

## 4. Rechnungen und Dokumente

Die vorhandene Typfilterung entfernt Rechnungen und „Erste Rechnung“ einschließlich historischer Namenskodierung aus der Dokumentenanzeige. Vereinbarungen, Kostenpläne und Verträge bleiben. Daten werden nicht gelöscht.

Inzwischen von Claude auf main und in Production behoben: Der Upload-Lader verlangte für alte private PDF-Routen eine Zuordnung zu `billing_invoices`. Das schloss die historischen 733 Datensätze aus. Der veröffentlichte Stand `86b90f1` bietet auch diese privaten Altbelege über die Rechnungsroute mit `source=upload` an, weiterhin streng auf die verifizierten Patientenzuordnungen begrenzt. Identische IDs zwischen Import und Upload werden dedupliziert.

Lesender Produktionsnachweis: **733 private Dateien heruntergeladen, 733 mit PDF-Kennung, 0 fehlend, 0 ungültige Kennungen.** Das bestätigt Speicherbestand, ausdrücklich nicht Patientenzugriff. Bestehender Upload-Weg für „Rechnung“/„Erste Rechnung“ und `destination=rechnungen` bleibt erhalten. `recoverPatientInvoice()` schreibt bereits seit dem vorhandenen Commit `754acbb` keine Dokumente mehr.

## 5. AnimaHost

Der aktuelle Stand auf main verwendet `animahost_invoice_portal_visibility` mit dem gemeinsamen Konto-/Patientengeltungsbereich und derselben PDF-Auswahl wie die App. Er schreibt keine Ersatzdokumente. Kein passender, eindeutiger Zugang, kein eindeutiger Beleg oder kein brauchbares PDF ergibt `manual_review`; bei unbekanntem Patienten bleibt die Antwort manuell. Für den Live-Fall meldet Claude `{cause: already_available, invoiceDate: 2026-09-30}`. Die Antwort nennt den Patienten und „Rechnungen“; eine Suche unter „Dokumente“ erklärt die Aufteilung.

Die Vorprüfung ist ein Datenbanknachweis über gemeinsame Leselogik, kein HTTP-Test des Browsers oder der Upload-Route. Der neue Rollentest schützt diese Übereinstimmung dauerhaft. Es wurde keine Patientennachricht verschickt.

## 6. Live-Fall 22.11., 06:36 Uhr Berlin

Lesend bestätigt: Der um 06:36:50 angelegte Rechnungsdatensatz gehört zu einem Patienten mit **3 aktiven Importbelegen und 1 Profil**. Der wiederhergestellte Datensatz verwendet dieselbe ID wie einer der aktiven Belege und wird damit nicht als zusätzliche Upload-Rechnung verdoppelt. Die serverseitige Bestandsprojektion liefert außerdem **1 weiteren historischen Upload**, also voraussichtlich 4 Belegzeilen für 3 Importbelege plus Altbeleg. Ob der Altbeleg eine fachliche Kopie ist, wurde nicht durch einen Inhaltsabgleich bewiesen; er wird nicht anhand von Namen oder Beträgen unterdrückt.

Abweichung zum übergebenen Vermerk: Die gespeicherte Entscheidung um 06:36:51 lautet `invoice_portal:pdf_restored`, Ursache `pdf_restored`; in dieser Sitzung wurde kein `document_restored`-Entscheidungsdatensatz gefunden. Das ändert nichts am Fehler der damaligen Erfolgsbehauptung.

Claude bestätigt nach 099 den SQL-Zugriff des Live-Falls: 3 Belege, 3 Editionen, PDF lädt, AnimaHost bereits verfügbar. Die sichtbare App-Abnahme bleibt davon getrennt. Es wurde keine Nachricht an ihn verschickt; Juan entscheidet darüber.

## 7. Die 254 Benachrichtigten ohne verknüpften Zugang

Lesende Produktionsabfragen am 22.11.2026 bestätigen 692 Benachrichtigte vom 13.10., davon 254 ohne `user_profiles` und ohne `patient_access_memberships`.

| Gruppe | Patienten |
| --- | ---: |
| Gültiger, unverbrauchter neuer Rechnungslink und historisch angenommene E-Mail | 181 |
| Kein neuer Rechnungslink, aber historisch angenommene E-Mail | 12 |
| Kein neuer Rechnungslink und kein passender historischer E-Mail-Nachweis in den geprüften Registern | 61 |
| Gesamt | 254 |

Für 192 ist eine Q3-Mail als angenommen erfasst, für 193 eine spätere Portal-Aufklärung; diese Gruppen überschneiden sich. Der Kommunikationsnachweis wurde teilweise aus erfolgreichen Workflow-Läufen mit Provider-ID nachgetragen. Es gibt keinen Zustellnachweis im geprüften Ledger. Abgleich erfolgte über Patientenbezug/Metadaten und hinterlegte Kontaktadressen; kein Beweis für einen historischen individualisierten Aktivierungslink.

Die archivierten Oktober-Vorlagen führten auf `/patient/login` bzw. dieselbe Anmeldung mit `next` zum Beleg. Auch die Aufklärungs-Mail führte zur Anmeldung. Das war **kein persönlicher Aktivierungslink**, selbst wenn Betreff oder Knopf von Aktivierung sprachen. Ohne Zugang muss dort die Einrichtung begonnen werden.

Für 181 existiert inzwischen ein unverbrauchter Rechnungszugangslink; bei 37 ist ein Seitenaufruf erfasst. Beim Öffnen erscheint das Formular für Geburtsdatum und neues Passwort; Öffnen allein aktiviert nichts. Nach erfolgreicher Bestätigung werden Profil und Mitgliedschaften eingerichtet, die Seite meldet an und führt zu „Rechnungen“. Bei abgelaufenem Link wird nach Bestätigung ein neuer Link angeboten. Für diese Gruppe enthält `invoice_access_events` keinen `mail_sent`-Eintrag; aus dem Linkbestand allein darf deshalb kein tatsächlicher Versand dieser neuen Links behauptet werden.

Keine Aktivierungslinks geöffnet, keine E-Mails verschickt, keine Konten verändert. Wiederholbare Aggregate: `node --env-file=.env.local scripts/audit-patient-invoice-access.mjs`.

## Code, Tests und Bereitstellung

Patienten-App-Deployment `21fddad` ist laut GitHub-Deployment-Status am 22.11. erfolgreich. Damit sind `source=patient_upload`, `hochgeladeneRechnungenStatus` und `zahlungsdatenStatus` bereits veröffentlicht. Konkrete Antworten mit Patientencookie wurden hier nicht gelesen. `belegVerfuegbarkeit` und die neue interne Health-Route sind Ergänzungen dieses Auftrags.

Beide Builds erfolgreich. Gezielte Rechnungstests: 12/12; Leitstandtests: 11/11. Der lesende Live-RPC-Audit besteht nach der Signaturkorrektur für alle fünf Rechnungs-/AnimaHost-Aufrufverträge (0 Verstöße). PostgreSQL-Rollentest erfolgreich. Breite Abrechnungssuite zuvor 110/111; der verbleibende Quellenvertrag betrifft gleichzeitig unversionierte Cura-Tool-Dateien eines anderen Auftrags. Diese werden nicht mitveröffentlicht. Der Live-RPC-Audit meldete außerdem zwei unabhängige fehlende/abweichende Signaturen (`record_immediate_invoice_payment`, `set_patient_billing_mode`); deren Status wird nicht als Rechnungszugriffsfehler ausgegeben oder still freigegeben.

Leitstand: Vorprüfung vor Manifest, Freigabe und Versand ist bereits in `52ab971` enthalten. Vier neue Regressionstests sichern erneute Prüfung und Fehlerfälle. Übergabe in `docs/2026-11-22-invoice-portal-preflight-contract.md`; keine UI-Änderung und kein Versand.

Noch offen: Installation 100 mit sauberem Rechnungs-Funktionsaudit, zweite unabhängige Familienprobe in Production, sichtbare App-/Praxiswarnungsabnahme. Alle Berichte und Tests bleiben ohne Patientennamen und Geheimnisse.
