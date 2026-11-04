# Scribe-Vorlagen: Korrektur nach Praxisregeln

Stand: 04.11.2026

## Ergebnis

Die direkt abbildbaren Abweichungen wurden in der Praxisdatenbank als neue Vorlagenversionen angelegt. Die vorherigen Versionen wurden archiviert und nicht überschrieben. Bereits bestätigte Einträge behalten dadurch ihre bisherige `vorlage_id` und bleiben unverändert.

`multiband|eingliederung` wurde bewusst nicht geändert: Die aktive Vorlage besitzt nur eine gemeinsame Auswahl „Initialbogen … OK/UK“ und kann weder den tatsächlich behandelten Kiefer noch die Anzahl der Bögen getrennt belegen. Damit lassen sich die von Juan verlangten getrennten Freigabetests für OK und UK nicht durchführen und die Menge nach R-128A nicht ohne Raten bestimmen.

## Versionierte Vorlagen

| Vorlage | Korrektur | Archivierte ID | Neue aktive ID |
| --- | --- | --- | --- |
| `multiband|diagnostik` | FRS: `Ä934a`; OPG: `Ä935d`, jeweils Menge 1 und nur bei der jeweiligen Auswahl | `cd6913cd-951a-43fb-b3fa-aa877c9f2405` | `634b0749-32d9-428b-8356-af17f70cc63d` |
| `aligner|start` | ASR/IPR: `GOZ 2030`, Menge 1 bei `ipr[0]` | `3ed54337-b900-4ecb-bffd-6ab6da53e362` | `95387dd8-246d-4eb7-ab6d-a21eb9440503` |
| `custom-00840474-f436-4fc6-afe4-4c96178c528a|start` | ASR/IPR: `GOZ 2030`, Menge 1 bei `ipr[0]` | `f3760363-a46c-467e-896b-67a2c5548ec9` | `a53921c4-e538-4306-8c15-20f9df44f1a7` |
| `custom-1cc072ed-2dbc-4654-80d4-8ba4e9e93e4e|start` | ASR/IPR: `GOZ 2030`, Menge 1 bei `ipr[0]` | `f96c0a44-500b-4b0f-be78-9f8de6a79d28` | `f17d1139-621e-4dab-bba4-fff093925fc4` |
| `custom-514b313c-dcb1-49cd-92b6-f67ebe391ea3|start` | ASR/IPR: `GOZ 2030`, Menge 1 bei `ipr[0]` | `f93deccf-aa09-45fb-b0c6-29e804b89d44` | `481273d6-0449-4d60-b65d-e194d4a7823e` |
| `custom-81d335bd-9749-4350-9f32-838f291fdb7a|start` | ASR/IPR: `GOZ 2030`, Menge 1 bei `ipr[0]` | `11f03d5e-caa6-41d6-a275-d59e2275d916` | `113bec68-1740-4678-8cba-f1902175e411` |
| `custom-90d73640-e4f9-45ab-aeb0-cb38637c6ab3|start` | ASR/IPR: `GOZ 2030`, Menge 1 bei `ipr[0]` | `6caafa4a-5bdf-44d7-96f6-b9f6526cb118` | `e11d5f8b-f41b-47d5-8d80-1a6b713fc09b` |
| `custom-b6573a69-df01-4790-81f1-8c019a10437a|start` | ASR/IPR: `GOZ 2030`, Menge 1 bei `ipr[0]` | `5f97a7e4-fd7f-410c-affa-4e0882ef2508` | `c7f27306-ac29-4a06-8357-db0693357a89` |
| `custom-d366fb17-b820-4d9f-8f61-b9a4d034c714|start` | ASR/IPR: `GOZ 2030`, Menge 1 bei `ipr[0]` | `2b63a745-1cd3-41b7-b7ad-99baeb3c08a5` | `c2941ba1-ea40-4459-9c6a-ad1a7d24759d` |
| `custom-df4cdd48-bf04-43f7-a4a1-db1653156287|start` | ASR/IPR: `GOZ 2030`, Menge 1 bei `ipr[0]` | `61d544b7-725a-43fe-ad52-6bd45788afbb` | `3f2a4707-3731-4fbd-adeb-4ab4b930a0e1` |

## Freigabetests

Die Tests liefen vor dem Schreiben gegen die vorgeschlagenen Versionen und nach dem Schreiben erneut gegen die aus der Praxisdatenbank geladenen aktiven Versionen. Verwendet wurde dieselbe deterministische Funktion `assessScribeConsistency`, die beim Bestätigen eines Scribe-Eintrags prüft.

| Vorlage/Fall | Erwartete neue Position | Ergebnis vor Schreiben | Ergebnis nach Schreiben |
| --- | --- | --- | --- |
| `multiband|diagnostik`, FRS | `Ä934a` × 1 | grün, 0 Issues | grün, 0 Issues |
| `multiband|diagnostik`, OPG | `Ä935d` × 1 | grün, 0 Issues | grün, 0 Issues |
| `aligner|start`, ASR/IPR | `GOZ 2030` × 1 | grün, 0 Issues | grün, 0 Issues |
| alle acht aktiven `custom-*|start`-Kopien, ASR/IPR | je `GOZ 2030` × 1 | alle grün, 0 Issues | alle grün, 0 Issues |

## Gestoppte Zeile: `multiband|eingliederung`

| Stand | Code | Text | Bedingung/Menge |
| --- | --- | --- | --- |
| alt, weiterhin aktiv | `BEMA 127a` | Eingliederung Bogen (inkl. Anpassen, Einprobe, Einligieren) | ohne Bedingung, Menge 1 |
| fachlich benötigt, nicht geschrieben | `BEMA 128a` | Konfektionierter Vollbogen | je dokumentiertem Kiefer, Menge 1 pro Bogen |

Die Vorlage bietet aktuell die Optionen `Initialbogen {bogen} OK/UK einligiert`, `Bg 012`, `Bg 014`, `Bg 016`, `Bg 016x016` und `Bg 016x022`. Keine dieser Optionen trennt OK von UK. Eine direkte Umstellung auf `BEMA 128a` × 1 würde bei beidseitiger Eingliederung zu wenig und bei nur einem Kiefer womöglich den falschen Ort belegen. Erforderlich ist zuerst eine getrennte Auswahl für Initialbogen OK und Initialbogen UK; danach können zwei eindeutige, bedingte Regeln und die verlangten getrennten Freigabetests angelegt werden.

## Querprüfung

Die zuvor dokumentierten Abweichungen wurden erneut gegen die aktiven Vorlagen geprüft:

- FRS: keine Abweichung mehr.
- OPG: keine Abweichung mehr.
- Aligner-Start und alle acht aktiven `custom-*|start`-Kopien: keine Abweichung mehr.
- Eingliederung: weiterhin genau eine bewusst gestoppte Abweichung (`BEMA 127a` statt `BEMA 128a`), weil Kiefer und Menge in der Vorlage nicht belegbar sind.

Die Querprüfung ist daher noch nicht vollständig ohne Abweichung. Sie ist für alle 1:1 umsetzbaren Zeilen sauber; offen bleibt ausschließlich die strukturell nicht abbildbare Eingliederung.
