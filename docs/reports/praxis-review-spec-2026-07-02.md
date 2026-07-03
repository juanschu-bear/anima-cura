# Praxis Review Spec - 2026-07-02

Basis: Live-Durchgang mit Sabine in der Praxis. Dieses Dokument trennt akute Bugs von groesseren Produktbausteinen.

## Sofort umsetzbar / akute Bugs

### 1. Patientensuche muss exakte händische Eingaben robuster finden

Beobachtung:

- Bei Eingabe eines Nachnamens wie `Rüger` erschien der erwartete Patient nicht direkt sauber in der Auswahl.

Ziel:

- Exakte oder fast exakte Nachnamen muessen priorisiert auftauchen.
- Umlaute muessen tolerant behandelt werden.
- Patientennummern (`ivoris_nummer`) sollen ebenfalls suchbar sein.

Status:

- umgesetzt am 2026-07-02 in
  - `src/hooks/useData.ts`
  - `src/app/api/praxis/search/route.ts`

### 2. Sabine sieht `Patienten` und `Tagesplan` leer

Beobachtung:

- Zugriff ist im UI vorhanden, Inhalte bleiben aber leer.

Wahrscheinliche Ursache:

- browserseitige Supabase-Abfragen laufen zu frueh an, bevor die Auth-Session im Client sauber bereitsteht

Status:

- Session-Gate ergaenzt am 2026-07-02 in
  - `src/hooks/useData.ts`
  - `src/app/(dashboard)/tagesplan/page.tsx`

### 3. GiroCard / Kreditkarte in `Zahlungen` nicht pauschal als `erhalten`

Beobachtung:

- Ein 0,01-Euro-GiroCard-Test aus der AnimaPay-Kasse erscheint in `Zahlungen` als `bereits erhalten`
- fachlich ist das zu grob, wenn der Eingang ueber Fremdzahlwege wie PayOne laeuft

Bedarf:

- Statusmodell fuer Kassenwege nachschärfen:
  - QR-Ueberweisung = wartet / eingegangen
  - Bar = erhalten
  - Guthaben = intern verrechnet
  - Girocard / Kreditkarte = nicht als klassischer Bankeingang labeln

Offen:
- umgesetzt am 2026-07-02 in
  - `src/app/(dashboard)/zahlungen/page.tsx`
- Ergebnis:
  - QR-Ueberweisung bleibt `wartet auf Geldeingang`
  - Bar bleibt `erhalten`
  - Guthaben wird als `interne Verrechnung` markiert
  - Girocard / Kreditkarte werden als `Terminalumsatz erfasst` markiert

## Mittlere Arbeitspakete

### 4. Zeitraumfilter in `Zahlungen`

Stand:
- umgesetzt am 2026-07-02 in
  - `src/app/(dashboard)/zahlungen/page.tsx`
- UI fuer `von` / `bis` ist vorhanden

Ziel:

- Auswahl von Zeitraum direkt in der Praxisansicht

### 5. Kasse: Tages-/Wochen-/Monats-Export als PDF oder CSV

Ziel:

- `AnimaPay Kasse live` soll fuer definierte Zeitraeume exportierbar sein

Lieferumfang:
- umgesetzt am 2026-07-02 in
  - `src/app/(dashboard)/kasse/page.tsx`
- aktueller Stand:
  - CSV-Export fuer Tag / Woche / Monat
  - Druckansicht fuer PDF-Speichern fuer Tag / Woche / Monat

### 6. Kasse: Ausgaben getrennt von Einnahmen erfassen

Ziel:

- Praxis-Ausgaben aus der Barkasse muessen im selben Modul sichtbar sein, aber sauber getrennt von Einnahmen

Hinweis:

- dafuer reicht kein kleiner UI-Patch; das ist ein Datenmodell-/Reporting-Thema

### 7. Kasse: Quartal / Notiz sauber mitfuehren

Ziel:

- bei Kassenvorgaengen optionale Quartals- oder Freitext-Notiz erfassen

Stand:

- `notiz` existiert bereits fuer Kassenzahlungen
- Quartal als eigener strukturierter Wert existiert noch nicht

## Matching / Zahlungslogik

### 8. Patientennummer staerker als Primärschlüssel im Matching nutzen

Beobachtung:

- In manuellen oder halbautomatischen Praxisablaeufen ist die Patientennummer eindeutig und oft verlasslicher als Namen

Ziel:

- wenn eine Patientennummer erkannt wird, soll das System den Patienten eindeutig und bevorzugt zuordnen

Moegliche Einsatzorte:

- Suche
- Kassenzweck
- Bank-Matching
- manuelle Nachbearbeitung

### 9. Historische Ratenzahlung besser gegen echte Zahlungshistorie spiegeln

Beobachtung:

- bei langlaufenden Faellen seit 2023/2024 muss besser sichtbar sein, wie viele Raten real schon bezahlt wurden

Ziel:

- bezahlte Historie gegen offene Raten und Planlogik sauber abgleichen

## Mahnwesen / Datenqualitaet

### 10. Im Mahnwesen auf Kontakt klicken -> Patientenprofil oeffnen

Ziel:

- aus der Mahnpipeline direkt in das Profil springen koennen

Status:

- umgesetzt am 2026-07-02 in
  - `src/app/(dashboard)/mahnwesen/page.tsx`

### 11. Mahnwesen auf falsche oder MOG-artige Daten pruefen

Beobachtung:

- laut Praxis stehen dort Eintraege, die fachlich fragwuerdig oder falsch zugeordnet wirken

Ziel:

- Audit, ob Demo-/Migrations-/Fehlzuordnungsdaten im Mahnwesen haengen

Status:

- Demo-Fallback entschärft am 2026-07-02 in
  - `src/app/(dashboard)/mahnwesen/page.tsx`
- Demo-Karten erscheinen nicht mehr automatisch, sondern nur noch bewusst via `?demo=1`
- Ohne echte Mahnfaelle zeigt die Ansicht jetzt klar an, dass keine Live-Faelle vorhanden sind

### 12. Dubletten und Namensverwechslungen weiter hart absichern

Beispiele aus dem Gespräch:

- gleiche Nachnamen gehoeren nicht automatisch zusammen
- unterschiedliche Patienten koennen irrefuehrend aehnlich aussehen

Ziel:

- Matching darf nicht aus Namensnaehe allein falsche Familienbeziehungen ableiten

## Reihenfolge-Empfehlung

1. Such- und Sichtbarkeitsbugs absichern
2. GiroCard/Kreditkarten-Status fachlich sauberziehen
3. Zeitraumfilter in `Zahlungen`
4. Mahnwesen- und Datenqualitaets-Audit
5. Export-/Kassen-Ausbau
6. tiefere Raten-/Historienlogik
