# Behandlungsarten: automatische Vorsortierung aus Zahlungen

Diese Logik ist bewusst einfach gehalten. Sie soll der Praxis Arbeit abnehmen und aktive Patienten vorsortieren, ohne dabei so zu tun, als wäre alles sicher. Ergebnis ist immer:

- `sehr wahrscheinlich`
- `wahrscheinlich`
- `unklar`

## Ziel

Aus echten Zahlungen der letzten 2 bis 3 Jahre für aktive Patienten eine plausible Behandlungsart ableiten:

- `A1`, `A2`, `A3` für Aligner
- `MB1`, `MB2`, `MB3` für Multiband
- `H1`, `H2` für rein herausnehmbare Geräte

## Relevante Daten

Wir halten die Eingangslogik bewusst schlank. Für das Vorsortieren reichen vor allem:

- Alter oder Altersgruppe bei Behandlungsstart
- Kasse oder Privat
- erste Zahlung
- monatliche Rate
- Zahlungsrhythmus
- bisherige Gesamtsumme
- Laufzeit der Zahlungen
- typische Zusatzkosten

Nicht erforderlich für diese erste Zuordnung:

- aktuelle Behandlungsphase
- Geschwisterregelung als eigenes Merkmal
- klinische Details

## Grundlogik

### Aligner

Aligner erkennt man vor allem an:

- Privatleistung
- Anfangszahlung um `450 €`
- zusätzliche Labor-/Materialkosten von etwa `800–1.600 €`
- Restzahlung über etwa `24 Monate`

Unterteilung:

- `A1`: Gesamtkosten über `6.000 €`
- `A2`: Gesamtkosten `4.000–6.000 €`
- `A3`: Gesamtkosten `2.000–4.000 €`

### Multiband

Multiband ist meist Kassenlogik mit Zusatzkosten.

- `MB1`:
  - reine Multibandbehandlung
  - typische Zusatzkosten `1.627,68 €`
  - typische Monatsrate `67,82 €`
  - meist `24` Monatsraten

- `MB2`:
  - derselbe große `16`-Quartale-Plan
  - zuerst herausnehmbare Apparatur, später Multiband
  - also **kein** reiner H1/H2-Fall
  - in Zahlungen oft Mischbild am Anfang, dann längerer Multiband-Verlauf

- `MB3`:
  - besondere Behandlung, oft Chirurgie oder Zusatzgeräte
  - typische Monatsrate `103,02 €`
  - meist `12` Monate für den chirurgischen Zusatzblock

### Herausnehmbare Geräte

Nur dann `H1/H2`, wenn **kein späteres Multiband im selben Plan** dahintersteht.

- `H1`:
  - nur herausnehmbar
  - Kostenrahmen `1.400–2.000 €`
  - eher kürzer

- `H2`:
  - nur herausnehmbar
  - Kostenrahmen `2.000–3.500 €`
  - eher länger

## Klare Abgrenzungen

### MB2 vs. H1/H2

Das ist die wichtigste Regel:

- `MB2` ist **nicht** einfach „Spange zuerst“
- `MB2` heißt:
  - erst herausnehmbare Apparatur
  - später Multiband
  - alles im selben Behandlungsplan

- `H1/H2` heißt:
  - nur herausnehmbare Geräte
  - kein späterer Multiband-Teil im selben Plan

### MB1 vs. MB3

- wiederholt `67,82 €` spricht stark für `MB1`
- wiederholt `103,02 €` spricht stark für `MB3`

### Aligner vs. alles andere

Aligner wird stark durch dieses Muster erkennbar:

- Privatleistung
- `450 €` zu Beginn
- dazu `800–1.600 €` Labor/Material
- Restzahlung über `24 Monate`

## Rolle des Alters

Das Alter ist kein Beweis, aber ein Verstärker:

- jüngere Patienten sprechen eher für `H1`, `H2` oder `MB2`
- ältere Jugendliche und Erwachsene eher für `Aligner`

Das Alter darf das Zahlungsverhalten nie überstimmen, sondern nur das Scoring schärfen.

## Empfohlener Output für die Praxis

Für jeden aktiven Patienten:

- Patient
- Alter / Altersgruppe
- Kasse / Privat
- erste Zahlung
- häufigste Monatsrate
- bisherige Gesamtsumme
- Laufzeit bisher
- Top-1 Vorschlag
- Top-2 Vorschlag
- Confidence
- kurzer Grund in Klartext

Beispiel:

- `MB1 – sehr wahrscheinlich`
- Grund: `24 ähnliche Raten um 67,82 €, Kassenlogik, Zusatzkosten im typischen MB1-Bereich`

## Wichtig

Dieses System soll vorsortieren, nicht blind final entscheiden.

Deshalb:

- `sehr wahrscheinlich` kann direkt vorausgefüllt werden
- `wahrscheinlich` sollte die Praxis nur kurz prüfen
- `unklar` bleibt offen für manuelle Zuordnung
