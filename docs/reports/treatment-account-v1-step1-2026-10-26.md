# Abrechnungszentrale V1 – Schritt 1

## Auftrag und Grenzen

Verbindlich: Bauauftrag mit korrigiertem Abschnitt 9 und `anima-cura-abrechnung-prototyp-verbindlich-2026-10-15.html` (SHA-256 `5020e1a7ab3d56ecc839aa0488585f98ab04cba7fb2ac70c95dcda6e4427b368`).
Anima Cura führt. IVORIS-Summenlisten sind Gegenproben, kein Nachweis einzelner Positionen.
Kalenderquartale seit dem bestätigten Behandlungsbeginn zählen fortlaufend, Startquartal = 1.
Diese lesende Stufe erzeugt keine Abschläge, Vorschläge in der Leistungsprüfung, Rechnungen, Zahlungen oder Nachrichten.
Keine Zahlungsbereinigung und keine Ratenplanänderung.

## Code vorhanden

- Additive Migrationen 059/060: die sieben freigegebenen Tabellen, unveränderliche Revisionen, Herkunft/Autor/Zeit, Patientenbindung und geschlossene Browserrechte. Beide produktiv ausgeführt.
- Gemeinsamer lesender Identitätsresolver: direkte/vertauschte vollständige Namen und gültiges Geburtsdatum; Varianten, mehrere Kandidaten und widersprüchliche stabile IDs bleiben Prüffälle. Lokale Suche ohne Trefferlimit mit Vollständigkeitskontrolle. Keine Anlage, Zusammenführung oder Portalfreigabe durch diesen lesenden Resolver. Der separate transaktionale Schutz der Anamnese-Anlagepfade ist unten dokumentiert.
- Eigene Kontoseite `/rechnungen/behandlungskonto/[id]`, verlinkt aus dem bestehenden Abrechnungsarbeitsbereich nach Patientenauswahl.
- Planversionen, Kalender-/Behandlungsquartal, Historienstand, Quelldokumentation, Bestandsnachträge und historische Rechnungs-/Quartalsreferenzen. Suche, aufklappbare Originaltexte und 15 Einträge pro Seite.
- Alte Scribe-Texte werden ausschließlich als unbestätigte Textvorschläge angezeigt. Bestätigung der Dokumentation und Mengen-Vorbelegungen erzeugen keine Leistungsbestätigung. Strukturierte Vorlage-Auswahlindizes werden ohne Versionsbeleg nicht interpretiert.

## Historische Basis

Die zwölf erhaltenen PDF-Listen (Banderolen-/Betragslisten BEMA und GOZ, Q4/2025–Q3/2026) wurden mit Datei-Prüfsummen ausgewertet.
4.563 Betragszeilen extrahiert; 4.181 eindeutig über Patientennummer und vollständige Namensfelder zugeordnet und zusätzlich als `historical_summary` in den neuen Tabellen gespeichert.
Wiederholung: 0 neue, 4.181 bereits vorhanden. Keine Bestandsrechnung oder Forderung verändert.
382 Quellzeilen wurden wegen uneindeutiger Nummern oder abweichender Namensfelder nicht automatisch zugeordnet. Das sind Quellzeilen über mehrere Quartale, nicht 382 Patienten oder ausstehende Rechnungen.
Private Einzelaufstellung: `tmp/treatment-import-applied.json`; vollständige extrahierte Quellen: `tmp/treatment-quarter-evidence.json` (beide nicht im Git).

BEMA-Spalten mit Leerwerten werden nicht erraten. Originalzeile und Zahlenfolge bleiben erhalten, aber werden nicht pauschal als Kassen-/Patientensaldo addiert. GOZ-Listen bleiben ebenfalls Summennachweise, keine Einzelpositionshistorie.
Aus bereits vorhandenen Rechnungsreferenzen werden keine neuen Forderungen erzeugt und keine Summen doppelt addiert.
Der technische Importautor `00000000-0000-4000-8000-000000000059` bezeichnet diesen Quellenimport, nicht einen Behandler oder eine fachliche Bestätigung.

## Getestet

- Automatisierte Tests: Kalenderquartalsgrenzen, unbekannter Beginn/Historie, ungeklärte Pausen, Planüberschneidungen, Scribe ohne Mengenannahmen, vertauschte Namen, Varianten, Konflikte, unvollständige Suchen und Zugriffsschutz.
- Migrationen in isoliertem PostgreSQL geprüft: unveränderliche Historie, Browserrechte, vollständige Kandidatensuche, Patientenbindung, gesperrtes TRUNCATE für den Dienst.
- Vollständiger Projekt-Testlauf: 247 bestanden, 0 fehlgeschlagen; abschließender Abrechnungslauf: 82 bestanden, 0 fehlgeschlagen. Produktionsbuild erfolgreich.
- UI mit ausdrücklich synthetischen Daten: breite/schmale Ansicht ohne horizontalen Überlauf, Suche, Seitenwechsel und Belegdetails. Unabhängige Abschlussprüfung: `ship` ausschließlich für die geprüften hellen Ansichten. Keine Änderung am bestehenden Designsystem.

## Mit echten Fällen abgenommen

**Noch nicht.** Technisch lesend ausgewählt und geprüft:

| Kategorie | Patientennummer | Quellenbeleg |
|---|---|---|
| Einfacher Vergleichsfall | 00004564 | BEMA-Banderolenliste Q3/2026 S. 8, Betragsliste S. 8; GOZ-Beträge S. 2 |
| Mehrere Bogeneinträge im vorhandenen Scribe-Bestand | 00005050 | BEMA-Banderolenliste Q3/2026 S. 2, Betragsliste S. 2 |
| Lange historische Rechnungsfolge | 00004488 | Rechnungsreferenzen ab 31.03.2022; BEMA-Banderolenliste Q3/2026 S. 5, Betragsliste S. 4 |

Der Beginn der Rechnungsfolge ist kein behaupteter Behandlungsbeginn. Die Zahl der Bogeneinträge ist kein Nachweis der tatsächlich eingesetzten Bogenmenge.
Reproduzierbare lesende Prüfung: `npx tsx scripts/audit-treatment-acceptance.ts`.
Sabine hat diese Konten noch nicht fachlich abgenommen. Es wurden keine Abnahmebestätigungen stellvertretend gespeichert.

## Offene Punkte

1. Für die drei Fälle gibt es im Bestand keine bestätigten versionierten Pläne; die vorhandenen Tabellen `behandlungsfall`/`behandlungsfall_multiband` sind produktiv leer. Beginn, Genehmigung je Code/Kiefer und Pausen bleiben unbekannt. Nicht aus Abschlagsnummer, erstem Rechnungsdatum oder Patientenanlage ableiten.
2. Summenlisten belegen keine Einzelpositionen und keine vollständige Historie. Bestätigte Start-/Endgrenzen der historischen Abdeckung fehlen.
3. Die 382 nicht sicher zugeordneten Quellzeilen bleiben dokumentiert offen; keine ungeprüfte Übernahme in fremde Akten.
4. Der neue Resolver ist in der Kontolesung verfügbar; Anamnese-Anlagepfade sind transaktional geschützt (siehe Fortsetzung). Eine vollständige Umstellung aller anderen historischen Importpfade wird damit nicht behauptet. Das Behandlungskonto selbst bleibt rein lesend.
5. Scribe-Pflichtzustand, explizite Mengen und unveränderliche Vorlagenversionen aus Abschnitt 9 sind noch nicht implementiert. Alte Daten bleiben deshalb nur Vorschläge.
6. Regelaktivierung, Bestandsbearbeitung, Lückenberechnung, Übertragsaktionen, Laborpostfach/Upload und 3D-Modell gehören zu Schritten 2–6 und wurden nicht vorgezogen. Die vollständige Labor-Mail-/Anhangssichtung ist dabei noch auszuführen.

Keine fachliche Vollabnahme und keine Behauptung einer lückenlosen Abrechnung. Stopp nach dieser lesenden Stufe; fehlende Quellen blockieren keine erfundenen Ersatzdaten, sondern bleiben sichtbar.

## Fortsetzung: Anlagepfade aktiviert

Migration 061 wurde nach Wiederherstellung des Chrome-Zugangs erfolgreich im Produktionsprojekt ausgeführt. Die produktiven Spalten und Trigger wurden vorher lesend geprüft: benötigte Spalten vorhanden, unbekannte Behandlungsdaten nullable, kein vorgeschalteter Patientenanlage-Trigger. Anschließend wurde der getestete Servercode `b9b9719` auf main veröffentlicht.

- Lokale Zuordnung und Neuanlage liegen in einer Transaktion. Eine Sperre der Patiententabelle serialisiert auch ältere INSERT-Schreiber; die Kandidatensuche wird unter dieser Sperre wiederholt. Keine Namens-/Geburtsdatums-/Geschlechts-/Behandlungsbeginn-Ersatzwerte. Fehlende Anlagefakten bleiben Prüffälle.
- Direkte und vertauschte Felder verwenden dieselbe Akte; Varianten oder widersprüchliche Verknüpfungen führen zur Klärung. Die bisherigen lokalen ungesicherten INSERT-/Alt-RPC-Pfade wurden im vorbereiteten Code entfernt.
- AnimaSign-Einreichung und Wiederholung sind keine Portal-Authentifizierung. Sie legen keine Portalrechte an, setzen kein Passwort zurück und geben keine gespeicherten Zugangsdaten aus. Bestehende Konten und Kennwörter werden nicht verändert. Die separate Aktivierung bleibt erforderlich; diese Änderung baut keinen neuen Aktivierungsprozess.
- Der Patientensync prüft dieselbe lokale Identität, bevor er weiterarbeitet. Suchausfälle behalten den Wiederholungspfad. Die externen Verzeichnissuchstrategien dürfen einander nicht widersprechen; die Vollständigkeit des bisherigen rohen IVORIS-Arrayvertrags ist nicht bewiesen. Diese Unsicherheit sperrt einen neuen externen Datensatz, nicht die lokale Erfassung in Anima Cura.
- Isolierte Datenbanktests prüfen Wiederholung, vertauschte Namen, unveränderte Bestandsdaten, fehlende Fakten, Browserrechte und das Unterlassen von Portalaktionen. Ein echter paralleler Produktionsdurchlauf oder eine fachliche Abnahme wurde nicht behauptet.
- Vollständiger Testlauf dieser Fortsetzung: 251 bestanden, 0 fehlgeschlagen; Produktionsbuild erfolgreich. Produktionsprobe mit NULL-Einreichungs-ID liefert kontrolliert `lookup_failed/submission_missing`, ohne Patientendaten zu bearbeiten. Funktionsrechte geprüft: Dienstzugriff erlaubt, anonyme und angemeldete Browserrollen gesperrt.

Keine historischen Eingänge erneut abgearbeitet. Die Abnahme der drei Behandlungskonten und die fehlenden Planbelege bleiben davon getrennt offen. Eine echte neue Formulareinreichung wurde nicht stellvertretend für einen Patienten erzeugt.
