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

## Was damit konkret besser ist

- Sabine sollte Patienten jetzt auch bei manueller Eingabe deutlich verlaesslicher finden.
- `Patienten` und `Tagesplan` sollten nicht mehr leer anlaufen, nur weil die Session im Browser noch nicht fertig war.
- Kartenzahlungen werden nicht mehr irrefuehrend als klassischer Geldeingang dargestellt.
- Im Mahnwesen tauchen nicht mehr automatisch Beispielkarten auf, die wie echte Faelle wirken.
- Die Kasse kann direkt fuer Tages-, Wochen- und Monatsauswertungen exportiert werden.
- Praxis-Ausgaben muessen nicht mehr zwischen Einnahmen versteckt werden.
- Quartalsbezogene Kassenbuchungen koennen jetzt strukturiert statt nur als Freitext erfasst werden.

## Noch offen

- Kassen-Ausgaben getrennt von Einnahmen als eigener Praxisprozess
- Quartalsfeld als strukturierter Wert in der Kasse
- tiefere Logik fuer historische Raten, damit alte und neue Zahlungen noch staerker automatisch gegengeprueft werden
- inhaltliches Audit einzelner Live-Mahnfaelle und offener Zuordnungen in den Daten

## Technischer Status

- Produktions-Build am 2026-07-02 erfolgreich durchgelaufen.
- Repo-Spec dazu:
  - `docs/reports/praxis-review-spec-2026-07-02.md`
