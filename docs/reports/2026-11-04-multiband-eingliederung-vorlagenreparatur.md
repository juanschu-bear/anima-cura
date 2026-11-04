# Vorlagenreparatur `multiband|eingliederung`

Stand: 04.11.2026. Freigabe durch Juan, Variante „nur Kein Bogen zulässig“.

## Versionierung

Die bisherige Vorlagenzeile wurde nicht überschrieben. Sie ist mit ihrem vollständigen bisherigen Inhalt inaktiv archiviert. Bereits bestätigte Einträge behalten ihre bisherige `vorlage_id` und bleiben unverändert.

| Fassung | UUID | Terminart | Status |
| --- | --- | --- | --- |
| bisher | `0049a572-644d-4138-9c6d-feaee80704fc` | `eingliederung__archiv__20261104__0049a572` | inaktiv, unverändert erhalten |
| neu | `8f0900a8-efd0-4fca-b974-199ddf75e34e` | `eingliederung` | aktiv |

## Neue Vorlagenstruktur

Die bisherige gemeinsame Gruppe `bogen` wurde durch die Pflichtgruppen `bogen_ok` und `bogen_uk` ersetzt. Beide Gruppen besitzen `type: "single"`, `req: true` und `explizit: true`. Das Template setzt die Gruppen in der Reihenfolge `umfang → bogen_ok → bogen_uk → aufkl` ein.

| Index | `bogen_ok` | `bogen_uk` |
| ---: | --- | --- |
| 0 | Kein Bogen OK. | Kein Bogen UK. |
| 1 | Initialbogen OK `{bogen}` einligiert. | Initialbogen UK `{bogen}` einligiert. |
| 2 | Initialbogen OK 012 einligiert. | Initialbogen UK 012 einligiert. |
| 3 | Initialbogen OK 014 einligiert. | Initialbogen UK 014 einligiert. |
| 4 | Initialbogen OK 016 einligiert. | Initialbogen UK 016 einligiert. |
| 5 | Initialbogen OK 016x016 einligiert. | Initialbogen UK 016x016 einligiert. |
| 6 | Initialbogen OK 016x022 einligiert. | Initialbogen UK 016x022 einligiert. |

Für jede gewählte Drahtoption `[1–6]` besteht genau eine bedingte Position `BEMA 128a` mit Menge 1 für den jeweiligen Kiefer. Die Option `[0]` erzeugt keine Bogenposition. Es gibt keine `128c`, weil dies der erste Bogen im Kiefer ist. `BEMA 126a`, `BEMA 119/120` und `Mat./Labor` blieben unverändert.

## Serverseitige Pflichtprüfung

Die Konsistenzprüfung versteht `explizit: true`. Eine leere Auswahl erzeugt das Issue `explicit_choice_required` und blockiert Bestätigung, neue Version und Positionsexport über denselben bestehenden Prüfpfad.

- OK: „Bitte beim Bogen OK eine Angabe wählen, bei Bedarf ‚Kein Bogen OK‘.“
- UK: „Bitte beim Bogen UK eine Angabe wählen, bei Bedarf ‚Kein Bogen UK‘.“

## Bekannte Einschränkung

Option `[1]` verwendet in beiden Kiefergruppen dieselbe Variable `{bogen}`. Wählt die Ärztin diese freie Option gleichzeitig für OK und UK, wird deshalb in beiden Texten dieselbe Bogendimension eingesetzt. Die festen Optionen `[2–6]` sind davon nicht betroffen.

## Freigabetests

Die Tests liefen vor der Versionierung gegen den Vorschlag und danach erneut gegen die aus der Praxisdatenbank geladene aktive Version.

| Fall | Erwartung | Vorher | Aktive Produktionsfassung |
| --- | --- | --- | --- |
| Initialbogen OK 014 + Initialbogen UK 014 | `128a` × 1 OK und `128a` × 1 UK | grün, 0 Issues | grün, 0 Issues |
| Initialbogen OK 016 + Kein Bogen UK | nur `128a` × 1 OK | grün, 0 Issues | grün, 0 Issues |
| Kein Bogen OK + Kein Bogen UK | keine `128a`, keine `128c` | grün, 0 Issues | grün, 0 Issues |
| Initialbogen OK 016 + UK leer | blockiert mit `explicit_choice_required` und freigegebenem UK-Satz | grün | grün |

## Querprüfung

Die aktive Eingliederungsvorlage enthält kein `BEMA 127a` mehr. Die zuvor korrigierte Diagnostik enthält keinen generischen `Ä925/Ä935*`-Code mehr; die aktiven Aligner-Startvorlagen enthalten kein `§6(1) analog` mehr. Die erneute Querprüfung der zuvor festgestellten Codeabweichungen gegen die Praxisregeln läuft damit ohne Abweichung durch.
