# Offene Posten Audit

Stand: 2026-08-02

## Kurzfazit

Die hohe Zahl offener Posten ist kein einzelner UI-Fehler. Sie setzt sich aus drei getrennten Ursachen zusammen:

1. Historischer IVORIS-Altbestand dominiert die Statistik.
2. Ein großer Teil bereits bestätigter Zahlungseingänge wurde nicht sauber in `offene_posten` zurückgeschrieben.
3. Ein kleiner Rest besteht aus kaputten oder unvollständigen Zuordnungen.

## Live-Befund

- `offene_posten` mit Status `offen` oder `teilbezahlt`: `4.961`
- Davon vor `2026-01-01`: `4.519`
- Posten ohne `patient_id`: `7`
- Offene oder teilbezahlte Posten mit bestätigter Referenz-Zahlung (`auto`, `manuell`, `abweichung`): `3.433`
- Davon mit betragsgenauer bestätigter Referenz-Zahlung: `2.021`
- Offene oder teilbezahlte Posten mit nur noch `unklar`er Referenz-Zahlung: `7`
- Transaktionen mit Platzhalter-Patient `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`: `5`

## Verteilung nach Rechnungsjahr

- `2018`: `4` Posten, `408,12 EUR`
- `2019`: `13` Posten, `748,53 EUR`
- `2020`: `27` Posten, `1.212,83 EUR`
- `2021`: `91` Posten, `13.671,10 EUR`
- `2022`: `542` Posten, `85.414,35 EUR`
- `2023`: `1.030` Posten, `141.006,20 EUR`
- `2024`: `1.344` Posten, `182.079,05 EUR`
- `2025`: `1.468` Posten, `204.754,80 EUR`
- `2026`: `442` Posten, `52.024,84 EUR`

## Interpretation je Ursache

### 1. Historischer Altbestand

Der größte Block ist historisch. Fast alle aktuell offenen Posten stammen aus 2025 oder älter. Das spricht gegen ein reines Frontend- oder Filterproblem und für einen nie vollständig nachgezogenen Alt-Abgleich.

### 2. Rückschreibefehler zwischen Bank-Matching und `offene_posten`

Die Matching-Logik aktualisiert `offene_posten` deterministisch nur dann direkt, wenn ein neuer ungeprüfter Eingang in `runBatchMatching()` als Referenztreffer verarbeitet wird.

Damit fallen historische Fälle aus dem Rücklauf heraus, wenn sie:

- bereits auf `geprueft_am` gesetzt wurden,
- schon `auto`, `manuell` oder `abweichung` sind,
- aber ihr passender `offene_posten` nie aktualisiert wurde.

Das erklärt, warum tausende Posten offen bleiben, obwohl bestätigte Referenz-Zahlungen existieren.

### 3. Kaputte oder unvollständige Zuordnungen

Klein, aber real:

- `7` offene Posten ohne `patient_id`
- `5` Transaktionen mit Platzhalter-Patient-ID
- `7` offene Posten mit nur noch `unklar`er Referenz-Zahlung

Diese Gruppe ist nicht die Hauptursache, blockiert aber einzelne korrekte Zuordnungen.

## Beispiele

### Eindeutig bezahlbar, aber noch offen

- `Arnold, Nevius` -> `00005842-1/2026-1` -> offen `122,90 EUR`, bestätigte Zahlung `122,90 EUR`
- `Bötte, Alexander Titus` -> `00005456-1/2026-1` -> offen `340,32 EUR`, bestätigte Zahlung `340,32 EUR`
- `Krekel, Sarah` -> `00006282-1/2026-1` -> offen `469,90 EUR`, bestätigte Zahlung `469,90 EUR`

### Noch offene Referenzfälle

- `Mühlenbrink, Lina` -> mehrere Posten mit Basis `00006543`, Eingang `299,71 EUR`, weiterhin `unklar`
- `Kater, Helena` -> `00002019-1/2022-1`, Eingang `59,43 EUR`, weiterhin `unklar`

## Empfehlung

1. Safe Repair-Job bauen:
   bestätigte Referenz-Zahlungen gegen `offene_posten` rückwirkend neu anwenden.
2. Platzhalter-Patienten bereinigen:
   `matched_patient_id = aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` neutralisieren und neu prüfen.
3. Kleine Restmenge manuell oder halbautomatisch nacharbeiten:
   die `7` offenen Referenzfälle und `7` Posten ohne `patient_id`.

## Wichtig

Die Zahl `4.800` ist also nicht primär deshalb hoch, weil aktuell massenhaft neue Zahlungen unentdeckt wären. Sie ist vor allem hoch, weil historisch sehr viele Posten nie sauber mit bereits existierenden Banktreffern abgeglichen wurden.

## Reparaturlauf

Am 2026-08-02 wurde ein Referenz-Reparaturlauf gegen die produktiven Daten ausgeführt.

- Vorher offene oder teilbezahlte Posten: `4.961`
- Nachher offene oder teilbezahlte Posten: `3.730`
- Zurückgeschriebene Referenz-Zahlungen: `1.234`
- Platzhalter-Patienten mit `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`: von `5` auf `0`

Restbestand nach dem Reparaturlauf:

- `233` unklare Referenz-Transaktionen bleiben zur Nacharbeit übrig
- `7` offene Posten ohne `patient_id` bleiben bestehen

Damit ist der größte technische Rückschreibefehler bereinigt. Der verbleibende Block ist jetzt deutlich kleiner und eher ein Mix aus Altbestand, fehlender Patientenverknüpfung und noch unklaren Einzelfällen.
