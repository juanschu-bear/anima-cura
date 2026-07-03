# Praxis Review Umsetzung - 2026-07-02

## Stand jetzt

- Patientensuche robuster gemacht:
  - Umlaute und Schreibvarianten werden besser erkannt
  - Patientennummern sind direkt suchbar
  - exakte Treffer werden hoeher priorisiert
- Leere Ansichten bei `Patienten` und `Tagesplan` abgefedert:
  - Datenabfragen warten jetzt auf eine fertige Client-Session
- `Zahlungen` fachlich sauberer gemacht:
  - Zeitraumfilter `von` / `bis` eingebaut
  - Kassenstatus getrennt:
    - QR = wartet auf Geldeingang
    - Bar = erhalten
    - Guthaben = intern verrechnet
    - Girocard / Kreditkarte = Terminalumsatz erfasst
- `Mahnwesen` bereinigt:
  - Klick auf Kontakt oeffnet Patientenprofil
  - Demo-Karten erscheinen nicht mehr ungefragt
  - ohne echte Mahnfaelle wird das klar angezeigt
- `Kasse` erweitert:
  - Export fuer Tag / Woche / Monat
  - CSV-Export
  - Druckansicht zum PDF-Speichern
  - getrennte Erfassung von Einnahmen und Ausgaben
  - optionaler strukturierter Quartalsbezug `Q1-Q4 + Jahr`
- `Ratenlogik` gehaertet:
  - Quartalsplaene erzeugen ihre Faelligkeiten jetzt korrekt im 3-Monats-Abstand
  - bestaetigte Zahlungen werden rechnerisch ueber mehrere offene Raten verteilt statt nur auf eine einzelne Rate
  - Teilzahlungen werden als Teilzahlung gefuehrt
  - Ratenplan- und Patientendetail zeigen jetzt an, wenn gespeicherter Planstand und echte Zahlungshistorie auseinanderlaufen

## Was damit konkret besser ist

- Sabine sollte Patienten jetzt auch bei manueller Eingabe deutlich verlaesslicher finden.
- `Patienten` und `Tagesplan` sollten nicht mehr leer anlaufen, nur weil die Session im Browser noch nicht fertig war.
- Kartenzahlungen werden nicht mehr irrefuehrend als klassischer Geldeingang dargestellt.
- Im Mahnwesen tauchen nicht mehr automatisch Beispielkarten auf, die wie echte Faelle wirken.
- Die Kasse kann direkt fuer Tages-, Wochen- und Monatsauswertungen exportiert werden.
- Praxis-Ausgaben muessen nicht mehr zwischen Einnahmen versteckt werden.
- Quartalsbezogene Kassenbuchungen koennen jetzt strukturiert statt nur als Freitext erfasst werden.
- Historische Faelle seit 2023/2024 koennen jetzt deutlich sauberer gegen bestaetigte Zahlungseingaenge gespiegelt werden.

## Noch offen

- Kassen-Ausgaben getrennt von Einnahmen als eigener Praxisprozess
- Quartalsfeld als strukturierter Wert in der Kasse
- tieferes Live-Audit einzelner Alt-Faelle, bei denen gespeicherter Planstand und echte Historie schon vorher auseinanderliefen
- inhaltliches Audit einzelner Live-Mahnfaelle und offener Zuordnungen in den Daten

## Technischer Status

- Produktions-Build erfolgreich durchgelaufen.
- Zusaetzliche Rechen-Tests erfolgreich:
  - `src/lib/services/__tests__/matching-engine.test.ts`
  - `src/lib/raten/__tests__/reconciliation.test.ts`
- Repo-Spec dazu:
  - `docs/reports/praxis-review-spec-2026-07-02.md`
