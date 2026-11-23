# Wissensimport und Probelauf mit Entwürfen – 23.11.2026

## Production-Import

Anima Cura (`zymqxzhjbcxzhzvjqvbv`), 23.11.2026 um 12:35 Uhr Berliner Zeit. Migrationen 103 und 104 laut Juan eingespielt; lokale Prüfsummen unverändert. Import über `animahost_import_knowledge` mit Juans verifiziertem Adminprofil, anschließend lesend nachgeprüft. Laufname: `2026-11-23-kfo-knowledge-import-v1-2`.

**Ergebnis: created 51, revised 0, unchanged 0.** Alle 51 Einträge als Version 1, `active=false`, `approved_at=null`. Alle 51 gespeicherten Import-Snapshots stimmen nach JSON-Serialisierung vollständig mit der Importdatei überein. Freigegebener Bestand vor und nach dem Import: 0. Kein Aufruf von `approve`, keine Änderung der Live-Umschaltung, kein Nachrichtenversand.

Importdatei: `docs/animahost/wissensbasis-kfo-v1.json`, Version `wissensbasis-kfo-v1.2-entwurf`, SHA-256 `9e9baba9cd263c4f063c95cb447b3b660242f8ff060bcef2b147982f53a4bc2e`.

## Offene Fragen aus Production

Die folgende Liste stammt nach dem Import tatsächlich aus `animahost_knowledge_open_questions`, nicht nur aus der lokalen Importdatei. Alle acht betreffen Version 1; Wortlaut unverändert.

1. **Diagnostik und Kostenplan** (`phase-diagnostik-kostenplan`): Wie lange dauert es von der Erstuntersuchung bis zum Kostenplan, und wie lange braucht die Kasse typischerweise?

2. **Abholung von Schienen oder Spangen** (`ablauf-abholung-schienen`): Typische Dauer vom Scan bis zur Abholung (Aligner, Platten). Wird der Patient aktiv informiert, wenn etwas fertig ist? Kann das System den Laborstatus bekommen?

3. **Spontan vorbeikommen** (`ablauf-spontan`): Gibt es Zeiten, in denen spontanes Kommen ungünstig ist (z. B. kurz vor 13 Uhr oder nach 18 Uhr)? Gilt es auch für Kinder mit herausnehmbarer Spange?

4. **Verspätung und verpasster Termin** (`ablauf-verspaetung`): Absage am selben Tag und Ausfallhonorar werden noch über den Leitstand geregelt; bis dahin gibt das System dazu keine Auskunft und leitet ans Team.

5. **Gummis, Wachs, Kausticks oder Spangendose fehlen** (`prob-gummis-alle`): Postversand von Zubehör: möglich oder nicht?

6. **Schiene oder herausnehmbare Spange verloren oder gebrochen** (`prob-schiene-verloren-kaputt`): Kosten für Ersatzschiene oder Reparatur: Wie läuft es in der Praxis konkret, was sagt das System dazu, wie lange dauert Ersatz?

7. **Schraube der Platte: wie oft drehen, verdreht, geht nicht** (`prob-schraube-platte`): Standard-Drehanweisung der Praxis, falls es eine gibt.

8. **Außerhalb der Sprechzeiten** (`warn-ausserhalb-sprechzeiten`): Soll zusätzlich der zahnärztliche Notdienst Leipzig genannt werden (z. B. nachts oder am Wochenende), und mit welcher Nummer?

## Gleiche 139 Fälle, Wissen ausschließlich im Probelauf freigegeben

39 Live-Fälle und 100 Archivfälle, identische Fall-IDs wie in beiden vorherigen Reihen; 110 Modellfälle, 22 ausgeschlossene Absender und 7 feste Medienantworten. Eingefrorener Export, Regeln und Modell unverändert. `bundledKfoPreview()` stellt die 51 Entwürfe nur im Speicher als zugelassene Quellen bereit. Production bleibt davon unberührt.

Modell `anthropic/claude-haiku-5.5`, Entwurf `reasoning:none`, unabhängige Gegenprüfung `reasoning:low`, sechs Fälle parallel. EU-Verarbeitung, ZDR, Quellen- und Schema-Prüfung unverändert. Benchmark-Code: `03654003c135936cc95c85e877ec02195a3e7762`.

| Kennzahl | Ursprünglicher Lauf | Optimierter Lauf ohne KFO-Entwürfe | Jetzt: KFO-Entwürfe |
|---|---:|---:|---:|
| Median Modellkette | 15.00 s | 6.94 s | 11.63 s |
| 90. Perzentil | 27.05 s | 14.38 s | 23.10 s |
| Maximum | 41.50 s | 20.27 s | 37.98 s |
| Über 17 Sekunden | 43 | 2 | 30 |
| Modellantworten: automatische Prüfung bestanden | 102 | 89 | 41 |
| Inhaltlich zurückgehalten | 2 | 20 | 50 |
| Modellfehler | 6 | 1 | 19 |

Die Grenze bleibt 17 Sekunden. Das Beobachtungsbudget von 42 Sekunden erlaubt es, langsame Ketten zu vermessen; es ist keine Erhöhung des Live-Budgets. Überschreitungen und tatsächliche Abbrüche sind unterschiedliche Kennzahlen. Gemessen ist die Modellkette einschließlich Quellenprüfung, ohne Production-Kontextabruf, HTTP-Endpunkt und Kaltstart. Die Reihen liefen zu unterschiedlichen Zeiten: Unterschiede sind kein isolierter kausaler Nachweis der Wissenswirkung.

### Fehlerarten und Wissenswirkung

19 technische Fehler: 16 tatsächliche Zeitabbrüche (11 lokale `TimeoutError`, 5 `GatewayTimeoutError`) und 3 Schemafehler. Separat überschreiten 30 Modellketten die Live-Grenze von 17 Sekunden; diese Gruppen überschneiden sich.

- `no_object:stop:AI_TypeValidationError`: 3.
- `TimeoutError`: 11.
- `GatewayTimeoutError`: 5.

**0 bestandene Modellantworten mit bestätigtem Wissensbeleg.** Die reine Anwesenheit des Wissens im Kontext belegt noch keine hilfreiche oder korrekte Nutzung. Automatisches Bestehen ersetzt keine Praxisfreigabe.

Verbleibende Ablehnungsgründe (Mehrfachnennung je Fall möglich):

- `wissensbeleg_ungueltig`: 22.
- `wissensbeleg_nicht_bestaetigt`: 20.
- `erfundene_tatsache`: 3.
- `terminzusage`: 9.
- `wiederholt_fruehere_antwort`: 2.
- `team_ohne_zeit`: 1.
- `uhrzeit_nicht_in_quellen`: 2.

Die Belegprüfung unterscheidet ungültige Quellen-/Versions-/Textbelege (`wissensbeleg_ungueltig`) und fehlende Übereinstimmung mit der unabhängigen Gegenprüfung (`wissensbeleg_nicht_bestaetigt`). Die gespeicherten Kennzahlen trennen innerhalb dieser Sammelgründe nicht weiter. Ein Entwurfsbeleg muss eine gültige ID/Version und einen wörtlichen Ausschnitt der Antwort enthalten; die Gegenprüfung muss dieselben Quellen bestätigen. Diese Schranke wurde für den Probelauf nicht abgeschaltet.

### Auffällige Live-Fälle

- **L10 (fehlende Rechnung):** Jetzt zurückgehalten wegen ungültigem Wissensbeleg. Das ist keine gelöste Rechnungsklärung und kein Beleg für eine bessere freigegebene Antwort.
- **L12 (Termin und fehlende Rechnung):** Automatisch bestanden; beide Anliegen werden dem Team mit Rückmeldezeit übergeben. Keine Behauptung, dass die Rechnung bereits verfügbar sei.
- **L13/L14/L26/L32:** Trotz vorhandener Wissensbasis zurückgehalten; Quellenbelege bzw. ihre Bestätigung scheitern.
- **L24 (zeitnaher Termin):** Automatisch bestanden, aber über 17 Sekunden. Im Live-Budget weiterhin nicht abgenommen.
- **L27 (Krankmeldung zur Arbeit):** Der eingefrorene Export behandelt den Fall weiterhin als Patientenfall. Eine freundliche Antwort behebt diese falsche Absenderklassifikation nicht. Die separate aktuelle Transportprüfung wurde hier nicht neu vermessen.
- **L30 (bereits neu gebuchter Termin):** Die Antwort behauptet, die Absage sei vermerkt. Der Probelauf schreibt keine Absage. Trotz bestandenem Prüfer bleibt dies ein inhaltlicher Abnahmefehler.

## Entscheidung und nächste Abnahme

**Keine Umschaltung.** Die Anforderung „keine Überschreitungen“ ist nicht erfüllt. Außerdem sind Quellenbelege, technische Schemafehler und die genannten inhaltlichen Fehlfreigaben zu beheben. Ein höheres Zeitlimit oder das Abschalten der unabhängigen Prüfung wäre keine Erfüllung dieser Abnahme.

Juan hat das Zitierverfahren nach diesem Lauf abgelöst. Diese Messung bleibt der Vorher-Stand für die Retrieval-Abnahme. Der neue Kern protokolliert serverseitig die an das Modell übergebenen Goldbeispiele, Wissenseinträge, Regeln und früheren Praxisfälle. Die Prüfentscheidung verwendet dafür keine Zitate. Das Laufzeitziel mit Wissensbasis liegt bei einem Median unter 8 Sekunden.

## Nachweise und Reproduktion

[Messwerte aller 139 Fälle](2026-11-23-wissensimport-probelauf-messwerte.json): nur Fallkürzel, Status, Zeiten, technische Spuren und Wissensreferenzen; keine Patientenkennungen oder Nachrichtentexte. Private Eingaben und Ausgaben bleiben außerhalb von Git.

```sh
node --import tsx scripts/animahost-replay-benchmark.mts PRIVATE_INPUT PRIVATE_OUTPUT draft_preview
```

Gateway-Schlüssel ausschließlich über die Umgebung. Für eine echte Wiederholung einen neuen Ausgabepfad verwenden; das Skript setzt eine vorhandene Ausgabe sonst fort. Production-Build erfolgreich. Keine Änderung an Anwendungscode oder bereits eingespielten Migrationen in diesem Auftrag.
