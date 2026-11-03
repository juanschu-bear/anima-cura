# Vorlagenreparatur `multiband|kontrolle`

Stand: 03.11.2026. Freigabe durch Juan. Der Bericht enthält keine Patienten- oder Behandlungsdaten.

## Versionierung

Die Datenbank erzwingt genau eine Vorlagenzeile je Kombination aus Behandlungsart und Terminart. Deshalb wurde die bisherige Zeile nicht überschrieben, sondern mit ihrer bisherigen UUID und ihrem bisherigen Inhalt inaktiv archiviert. Eine neue Zeile mit neuer UUID ist die aktive Fassung.

| Fassung | UUID | Terminart | Status |
| --- | --- | --- | --- |
| bisher | `5cec9480-c67c-4ccc-b240-c7475170c511` | `kontrolle__archiv__20261103__5cec9480` | inaktiv, unverändert erhalten |
| neu | `ec53035c-4480-4834-9630-6ce90d9cde4e` | `kontrolle` | aktiv |

Die alte Regel `BEMA 127a` mit der nicht mehr vorhandenen Bedingung `bogen[0]` ist nur in der archivierten Fassung enthalten. Bereits bestätigte Einträge bleiben unverändert und behalten ihre bisherige Vorlagen-ID.

Die Praxisoption `bogen_uk[9]` wurde ebenfalls versioniert: Die bisherige Zeile mit „Bogenwechsel OK Reverse Curve“ ist inaktiv erhalten; eine neue aktive Zeile lautet „Bogenwechsel UK Reverse Curve“.

## Aktive Positionszuordnung

| Auswahl | Positionen, jeweils Menge 1 |
| --- | --- |
| `bogen_ok[1]` bis `[4]` | `BEMA 128a` Konfektionierter Vollbogen; `BEMA 128c` Bogen ausgegliedert |
| `bogen_ok[5]`, `[12]` | `BEMA 128b` Individualisierter Vollbogen; `BEMA 128c` Bogen ausgegliedert |
| `bogen_uk[1]` bis `[4]` | `BEMA 128a` Konfektionierter Vollbogen; `BEMA 128c` Bogen ausgegliedert |
| `bogen_uk[5]`, `[9]` | `BEMA 128b` Individualisierter Vollbogen; `BEMA 128c` Bogen ausgegliedert |
| ohne Bedingung | `BEMA 119/120` Abschlag Behandlungsquartal |

`bogen_ok[12]` ist ein derzeit beibehaltenes Duplikat von `bogen_ok[5]`. Die verwaisten Praxisoptionen „OK Bg 016*016“ und „OK/UK Reverse curve“ in der nicht mehr vorhandenen Gruppe `bogen` wurden nicht übernommen.

## Freigabetests gegen die aktive Produktionsfassung

| Fall | Erwartete Positionen | Ergebnis |
| --- | --- | --- |
| „Bogenwechsel OK 016. Bogenwechsel UK 016.“ | `128a` ×1 OK, `128c` ×1 OK, `128a` ×1 UK, `128c` ×1 UK, `119/120` ×1 | keine Issue-Codes, Bestätigung möglich |
| „Kein Wechsel OK. Bogenwechsel UK 014.“ | `128a` ×1 UK, `128c` ×1 UK, `119/120` ×1 | keine OK-Position, keine Issue-Codes, Bestätigung möglich |

## Bestandsmessung über 735 bestätigte Einträge

Die Messung prüft historische, bereits bestätigte Einträge gegen die heute aktive Vorlagen- und Optionsfassung. Sie verändert keinen Eintrag.

| Issue-Code | vorher | nachher |
| --- | ---: | ---: |
| `template_rule_reference_invalid` | 399 | 0 |
| `wire_position_unmapped` | 275 | 66 |
| `template_text_mismatch` | 228 | 228 |
| `selection_invalid` | 211 | 211 |
| `selected_text_missing` | 179 | 180 |

Gründe bei mehr als fünf Fällen:

- `wire_position_unmapped` (66): Historische Texte nennen einen durchgeführten Bogenwechsel für OK oder UK, ihre damals gespeicherte Auswahl belegt aber keine heute gültige kieferbezogene Positionsregel; betroffen sind 31 OK- und 35 UK-Nennungen.
- `template_text_mismatch` (228): Der gespeicherte historische Gesamttext wurde mit einer früheren Vorlage beziehungsweise einem früheren Optionsstand erzeugt und entspricht deshalb nicht mehr exakt dem heutigen Vorlagenfragment.
- `selection_invalid` (211): Historische Auswahlen verweisen auf inzwischen entfernte Gruppen oder auf Optionsindizes außerhalb des heutigen Katalogs; allein die frühere Gruppe `bogen` verursacht 49 Fälle.
- `selected_text_missing` (180): Zu einer gespeicherten Auswahl fehlt im historischen Text der heute exakt hinterlegte Optionstext, unter anderem nach späteren Textkorrekturen und Ergänzungen von Praxisoptionen.

Insgesamt bleiben 282 Einträge ohne erkannten Konflikt und 453 mit mindestens einem Konflikt. Zusätzlich melden 399 historische Einträge erwartungsgemäß `template_identity_mismatch`, weil bestätigte Altbestände ihre archivierte Vorlagen-ID behalten; das ist die beabsichtigte Folge der Versionierung und keine Änderung dieser Einträge.

## Lesende Querprüfung gegen die Praxisregeln

Grundlage sind alle 96 aktiven `doku_vorlagen` und die Praxisregeln in `src/lib/practice-reference.json`. Geprüft wurde ausschließlich, ob eine Vorlage für dieselbe erkennbare Leistung einen anderen Code ausgibt. Es wurde nichts weiter geändert.

| Vorlage | Option/Leistung | Scribe-Code | Code laut Praxisregel |
| --- | --- | --- | --- |
| `multiband|eingliederung` – Eingliederung / Bebänderung | Initialbogen `bogen[0–5]`; kein Teilbogen dokumentiert | `BEMA 127a` | `BEMA 128a` nach R-128A; `127a` gilt laut R-127A nur für Teil-/Segmentbogen |
| `multiband|diagnostik` – Anfangsdiagnostik | FRS angefertigt | `Ä925/Ä935*` | `Ä934a` nach R-FRS; `BEMA 118` für die Auswertung ist bereits zusätzlich vorhanden |
| `multiband|diagnostik` – Anfangsdiagnostik | OPG angefertigt | `Ä925/Ä935*` | `Ä935d` nach R-OPG |
| `aligner|start` – Start: Attachments & 1. Schiene | ASR/IPR durchgeführt | `§6(1) analog` | `GOZ 2030` nach R-2030 |
| `custom-00840474-f436-4fc6-afe4-4c96178c528a|start` | ASR/IPR durchgeführt | `§6(1) analog` | `GOZ 2030` nach R-2030 |
| `custom-d366fb17-b820-4d9f-8f61-b9a4d034c714|start` | ASR/IPR durchgeführt | `§6(1) analog` | `GOZ 2030` nach R-2030 |
| `custom-90d73640-e4f9-45ab-aeb0-cb38637c6ab3|start` | ASR/IPR durchgeführt | `§6(1) analog` | `GOZ 2030` nach R-2030 |
| `custom-df4cdd48-bf04-43f7-a4a1-db1653156287|start` | ASR/IPR durchgeführt | `§6(1) analog` | `GOZ 2030` nach R-2030 |
| `custom-b6573a69-df01-4790-81f1-8c019a10437a|start` | ASR/IPR durchgeführt | `§6(1) analog` | `GOZ 2030` nach R-2030 |
| `custom-514b313c-dcb1-49cd-92b6-f67ebe391ea3|start` | ASR/IPR durchgeführt | `§6(1) analog` | `GOZ 2030` nach R-2030 |
| `custom-81d335bd-9749-4350-9f32-838f291fdb7a|start` | ASR/IPR durchgeführt | `§6(1) analog` | `GOZ 2030` nach R-2030 |
| `custom-1cc072ed-2dbc-4654-80d4-8ba4e9e93e4e|start` | ASR/IPR durchgeführt | `§6(1) analog` | `GOZ 2030` nach R-2030 |

Die mehrfach aufgeführten `custom-*|start`-Vorlagen sind aktive Kopien derselben Aligner-Startvorlage. Fehlende Positionsregeln wurden in dieser Querprüfung nicht als „anderer Code“ ausgegeben; die Tabelle enthält nur tatsächlich vorhandene, abweichende Codes.
