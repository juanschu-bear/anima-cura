# Anima Cura – verbindliche Architektur für Patientenzahlungen und offene Beträge

**Stand:** 15.09.2026  
**Status:** Fachliche Spezifikation vor Umsetzung  
**Ziel:** Jeder im Patientenprofil angezeigte Euro muss auf Rechnungen, Banktransaktionen und nachvollziehbare Zuordnungsentscheidungen zurückführbar sein.

## 1. Verbindliche fachliche Grundregel

Ein Patientensaldo wird ausschließlich aus belegten Geschäftsvorfällen berechnet:

```text
Nettoposition = gültige Rechnungen
              - Gutschriften
              - bestätigte Patientenzahlungen
              + bestätigte Rücklastschriften und Rückzahlungen

Offener Betrag = max(0, Nettoposition)
Patientenguthaben = max(0, -Nettoposition)
```

Eine Zahlung reduziert den Gesamtsaldo genau einmal, sobald ihre Zuordnung zu einem Patienten bestätigt ist. Dafür ist keine Zuordnung zu einer einzelnen Rechnung erforderlich.

Die Rechnungszuordnung beantwortet anschließend nur noch, welche Rechnung durch das bereits anerkannte Patientengeld beglichen wurde. Sie darf den Gesamtsaldo kein zweites Mal reduzieren.

## 2. Was heute strukturell nicht ausreicht

- `transaktionen.matched_patient_id` erlaubt nur einen Patienten pro Banktransaktion.
- `transaktionen.matched_rate_id` erlaubt nur eine Rate und bildet keine vollständige Rechnungsaufteilung ab.
- Zuordnungsinformationen liegen teilweise unstrukturiert in `matching_details`.
- Bestätigungen verändern `raten` und `offene_posten` direkt. Eine eigenständige, centgenaue Zuordnungsbuchung als Beleg fehlt.
- `offene_posten.status`, `offen` und `gezahlt` sind gespeicherte Ergebnisse. Sie können von den tatsächlichen Bankzuordnungen abweichen.
- `nicht_mahnen` vermischt fachliche Verifikation, UI-Sichtbarkeit und Mahnschutz in einem einzigen Schalter.
- Eine Elternzahlung für mehrere Kinder kann im bestehenden Modell nicht korrekt gesplittet werden.

Es wurde bei der vorangegangenen Sicherungsmaßnahme kein Datensatz gelöscht. Ungeprüfte Forderungen wurden lediglich von bestätigten Forderungen getrennt. Diese Maßnahme verhindert falsche Patientenkontakte, ersetzt aber nicht die hier definierte vollständige Ledger-Architektur.

## 3. Vier getrennte Wahrheiten

### 3.1 Rechnung

Eine Rechnung ist eine Forderung mit unveränderlicher Identität, ursprünglichem Betrag, Rechnungsdatum und Patient. Korrekturen erfolgen durch Storno oder Gutschrift, nicht durch Überschreiben des ursprünglichen Betrags.

### 3.2 Banktransaktion

Eine von finAPI importierte Transaktion ist ein unveränderlicher Bankbeleg. Rohbetrag, Buchungsdatum, Absender, IBAN, Verwendungszweck und finAPI-ID dürfen durch Matching niemals überschrieben werden.

### 3.3 Patientenzuordnung

Sie legt fest, welchem Patienten welcher Teilbetrag einer Banktransaktion gehört. Erst eine bestätigte Patientenzuordnung beeinflusst den Gesamtsaldo.

### 3.4 Rechnungszuordnung

Sie verteilt einen bereits einem Patienten bestätigten Betrag auf eine oder mehrere Rechnungen. Ein nicht auf Rechnungen verteilter Rest bleibt als Patientenguthaben beziehungsweise als „Rechnungszuordnung offen“ erhalten.

## 4. Erforderliches Datenmodell

### `payment_patient_allocations`

Eine Zeile entspricht einem Teilbetrag einer Banktransaktion, der einem Patienten zugeordnet oder vorgeschlagen wird.

Pflichtfelder:

- `id`
- `transaction_id`
- `patient_id`
- `amount_cents`
- `state`: `candidate`, `confirmed_auto`, `confirmed_manual`, `rejected`, `reversed`
- `confidence_score`: 0–100
- `evidence`: strukturierte Belege wie Patientennummer, Rechnungsnummer, Name, IBAN-Historie und Betrag
- `decision_reason`
- `created_at`, `confirmed_at`, `confirmed_by`
- `reversal_of_allocation_id` für Gegenbuchungen

Regeln:

- Die Summe aller aktiven bestätigten Teilbeträge darf den verfügbaren Betrag der Banktransaktion nicht überschreiten.
- Ein Betrag wird niemals durch Update „umgebucht“. Korrekturen erzeugen Gegenbuchung und neue Zuordnung.
- Eine Transaktion darf auf mehrere Patienten verteilt werden.

### `payment_invoice_allocations`

Eine Zeile verteilt einen bestätigten Patientenzahlungsanteil auf eine Rechnung.

Pflichtfelder:

- `id`
- `patient_allocation_id`
- `invoice_id`
- `amount_cents`
- `state`: `allocated_auto`, `allocated_manual`, `reversed`
- `allocation_rule`: `exact_reference`, `exact_invoice_number`, `fifo`, `manual`
- `created_at`, `created_by`
- `reversal_of_allocation_id`

Regeln:

- Patient der Rechnung und Patient der Zahlungszuordnung müssen identisch sein.
- Die Summe der Rechnungszuordnungen darf den bestätigten Patientenzahlungsanteil nicht überschreiten.
- Die Summe aktiver Zuordnungen zu einer Rechnung darf deren offenen Rechnungsbetrag nicht überschreiten.

### Bestehende Tabellen

- `transaktionen` bleibt Rohquelle der Bankbewegungen.
- `offene_posten` wird zur Rechnungsquelle migriert. `offen`, `gezahlt` und `status` werden anschließend nur noch abgeleitet oder durch einen kontrollierten Projektionsprozess geschrieben.
- `raten` beschreibt Fälligkeiten beziehungsweise Zahlungspläne, ist aber nicht länger die Quelle des tatsächlichen Patientensaldos.
- `patients.guthaben` darf nicht parallel frei fortgeschrieben werden. Guthaben wird aus dem Ledger berechnet.

## 5. Zustände und sichtbare Bedeutung

| Zustand | Bedeutung | Im Patientenprofil | Saldo-wirksam |
|---|---|---|---:|
| Banktransaktion ohne Patientenkandidat | Zahlungseingang vorhanden, Patient unbekannt | Nicht beliebig einem Patienten zeigen; zentral in „Zuordnung offen“ | Nein |
| Kandidat unter 75 % | Mögliche Patientenzuordnung | Beim Kandidaten als „Möglicher Zahlungseingang – Prüfung offen“, klar ohne Bestätigung | Nein |
| Patient mindestens 75 %, eindeutig | Patientenzuordnung automatisch bestätigt | „Zahlung erkannt“, mit Betrag, Datum, Bankbeleg und Zuordnungsgrund | Ja |
| Patient manuell bestätigt | Praxis hat Zuordnung bestätigt | „Zahlung manuell bestätigt“ mit Bearbeiter und Zeitpunkt | Ja |
| Patient bestätigt, Rechnung unbekannt | Geld gehört sicher zum Patienten | „Zahlung erkannt – Rechnungszuordnung offen“ | Ja |
| Patient und Rechnung bestätigt | Vollständige Zuordnung | Zahlung erscheint bei Patient und Rechnung | Ja, genau einmal |
| Splitzahlung | Teile gehören mehreren Patienten/Rechnungen | Jeder Patient sieht nur seinen bestätigten Teilbetrag | Je bestätigtem Teilbetrag |
| Rücklastschrift/Rückzahlung | Frühere Zahlung wirtschaftlich aufgehoben | Gegenbuchung mit Bezug auf Ursprungszahlung | Erhöht Nettoposition |

## 6. Schwelle und Beweislogik

Die vom Auftraggeber festgelegte automatische Bestätigungsschwelle ist **mindestens 75 %**.

Diese Zahl darf nicht als frei erfundener KI-Wert entstehen. Der Score muss deterministisch aus gespeicherten Belegen berechnet und erklärbar angezeigt werden.

Mindestregeln:

- Eindeutige Patientennummer im Verwendungszweck: starker Identitätsbeleg.
- Eindeutige vollständige Rechnungsreferenz: starker Patienten- und Rechnungsbeleg.
- Eindeutiger vollständiger Patientenname: kann 75 % erreichen, sofern im Datenbestand keine Namensmehrdeutigkeit besteht.
- Bekannte Absender-IBAN darf nur unterstützen; bei Familienkonten ist sie kein alleiniger Patientenbeleg.
- Betrag und Datum sind Zuordnungsbelege für eine Rechnung, aber allein kein sicherer Identitätsbeleg.
- Mehrere gleich plausible Patienten verhindern automatische Bestätigung, auch wenn ein Rohscore rechnerisch 75 erreicht.
- Patientennummer oder Name mehrerer Kinder in einer Überweisung erzeugt Split-Kandidaten; der Gesamtbetrag wird erst saldo-wirksam, wenn die Teilbeträge bestimmt oder bestätigt sind.

## 7. Automatische Rechnungsverteilung

Wenn der Patient bestätigt, die Rechnung aber nicht eindeutig erkannt ist:

1. exakte vollständige Rechnungsreferenz,
2. exakte eindeutige Rechnungsnummer,
3. ansonsten älteste fällige Rechnung zuerst (FIFO),
4. Restbetrag auf die nächste Rechnung,
5. verbleibender Überschuss als Patientenguthaben.

Die FIFO-Verteilung muss als eigene Zuordnungsbuchung sichtbar und reversibel sein. Eine spätere manuelle Korrektur verändert den Patientengesamtsaldo nicht, sondern nur die Verteilung zwischen Rechnungen.

## 8. Patientenprofil – verbindliche Darstellung

Jedes Profil zeigt getrennt:

1. **Aktueller Gesamtsaldo** mit Berechnungszeitpunkt.
2. **Rechnungen** mit ursprünglichem Betrag, angerechnetem Betrag und Restbetrag.
3. **Bestätigte Zahlungen** mit Datum, Betrag, Bankbeleg, Score/Beweis und Rechnungsverteilung.
4. **Rechnungszuordnung offen** für patientensichere, saldo-wirksame Zahlungen ohne endgültige Rechnung.
5. **Mögliche Zahlungseingänge** unter 75 %, ausdrücklich nicht saldo-wirksam.
6. **Guthaben** als berechneter Überschuss.
7. **Korrekturen/Rücklastschriften** mit Bezug auf die ursprüngliche Buchung.

Kein UI darf aus einem ungeprüften Rechnungsimport allein behaupten, ein Patient schulde Geld. Umgekehrt darf eine bestätigte Patientenzahlung nicht unsichtbar bleiben, nur weil ihre konkrete Rechnung noch ungeklärt ist.

## 9. Zentrale Prüfansicht

Die Praxis benötigt eine Arbeitsliste mit getrennten Mengen:

- Banktransaktionen ohne Patientenkandidat,
- Patientenkandidaten unter 75 %, 
- bestätigte Patientenzahlungen mit offener Rechnungszuordnung,
- unvollständige Splitzahlungen,
- widersprüchliche oder überbuchte Zuordnungen,
- Rücklastschriften ohne eindeutige Ursprungszahlung.

Jeder Fall zeigt Rohbankdaten, Kandidaten, Beweise, Score, erwartete Saldowirkung und vollständige Entscheidungshistorie.

## 10. Harte Invarianten

Diese Regeln müssen in Datenbank-Constraints beziehungsweise Transaktionen und zusätzlich durch Tests abgesichert werden:

1. Kein bestätigter Zahlungscent wird mehr als einmal im Patientensaldo berücksichtigt.
2. Kein Transaktionscent wird gleichzeitig zwei Patienten vollständig gutgeschrieben.
3. Summe der Splits ist kleiner oder gleich dem verfügbaren Transaktionsbetrag.
4. Eine Zuordnung unter 75 % verändert keinen Saldo.
5. Eine eindeutige Zuordnung ab 75 % reduziert den Patientensaldo auch ohne Rechnungszuordnung.
6. Rechnungszuordnung und -korrektur verändern den bereits reduzierten Gesamtsaldo nicht erneut.
7. Jede Saldoposition verweist auf einen unveränderten Ursprungsbeleg oder eine explizite Gegenbuchung.
8. Negative Nettoposition wird als Guthaben, niemals als negative offene Forderung angezeigt.
9. Mahnung ist nur zulässig, wenn der positive Gesamtsaldo vollständig aus gültigen Rechnungen und bestätigten Zuordnungen berechnet wurde und kein blockierender Konflikt besteht.
10. Neuimport und erneuter Matching-Lauf sind idempotent: gleiche Quelldaten erzeugen keine zweite Buchung.

## 11. Abnahmekriterien

- [ ] Für jeden Patienten gilt centgenau: Rechnungen minus Gutschriften minus bestätigte Zahlungen plus Gegenbuchungen = Nettoposition.
- [ ] Jede angezeigte Zahlung öffnet ihren Bankbeleg und ihre Entscheidungshistorie.
- [ ] Eine Zahlung mit eindeutigem Patienten und Score ≥75 reduziert den Gesamtsaldo genau einmal.
- [ ] Dieselbe Zahlung ohne eindeutige Rechnung erscheint als „Zahlung erkannt – Rechnungszuordnung offen“.
- [ ] Eine Zuordnung mit Score <75 verändert den Saldo nicht.
- [ ] Eine Elternzahlung kann centgenau auf mindestens zwei Kinder und mehrere Rechnungen verteilt werden.
- [ ] Eine spätere Änderung der Rechnungsverteilung verändert nicht nochmals den Patientengesamtsaldo.
- [ ] Überzahlung wird als Guthaben angezeigt und bleibt mit der Banktransaktion verknüpft.
- [ ] Rücklastschrift stellt den betroffenen Betrag über eine Gegenbuchung wieder offen.
- [ ] Kein Prüffall kann eine automatische Mahnung auslösen.
- [ ] Ein vollständiger Neuaufbau aller Salden aus dem Ledger ergibt exakt dieselben Werte wie die laufende Projektion.
- [ ] Wiederholter finAPI-Import und Matching-Lauf verändern die Summen nicht.

## 12. Einführungsreihenfolge ohne Datenverlust

1. Neue Zuordnungstabellen und Constraints ergänzen; bestehende Werte noch nicht abschalten.
2. Alle bestehenden Banktransaktionen und bisherigen Matching-Beweise unverändert inventarisieren.
3. Bestehende bestätigte Zuordnungen als Ledger-Buchungen migrieren; zweifelhafte Fälle bleiben Kandidaten.
4. Parallele Schattenberechnung des neuen Patientensaldos durchführen.
5. Für jeden Patienten Altanzeige gegen Ledgerwert vergleichen und Abweichungen in eine Prüfliste schreiben.
6. Erst nach centgenauer Gesamtprüfung Patientenprofil und Berichte auf den Ledger umstellen.
7. Mahnwesen nur auf den neuen verifizierten Saldo umstellen.
8. Direkte Fortschreibung von `patients.guthaben`, `offene_posten.offen/gezahlt/status` und konkurrierenden Raten-Salden sperren oder ausschließlich aus der Projektion erlauben.

Es werden bei der Migration weder Banktransaktionen noch Rechnungen gelöscht. Unsichere historische Informationen bleiben mit ihrem tatsächlichen Prüfstatus erhalten.

## 13. Abgrenzung

**In diesem Vorhaben enthalten:**

- Bankeingänge, Patientenzuordnung, Splits, Rechnungsverteilung, Guthaben, Rücklastschriften, Saldo, Patientenanzeige, Prüfliste und Mahnschutz.

**Nicht automatisch als Wahrheit angenommen:**

- Ein IVORIS-Status ohne zugehörigen Rechnungs- oder Zahlungsbeleg.
- Namensähnlichkeit bei mehreren möglichen Patienten.
- Ein passender Betrag ohne Identitätsbeleg.
- Das heutige Feld `nicht_mahnen` als Ersatz für einen fachlichen Prüfzustand.

## 14. Klarheitsbewertung

| Dimension | Score | Mindestwert | Ergebnis |
|---|---:|---:|---|
| Zielklarheit | 0,95 | 0,75 | erfüllt |
| Abgrenzung | 0,88 | 0,70 | erfüllt |
| Daten- und Sicherheitsregeln | 0,90 | 0,65 | erfüllt |
| Abnahmekriterien | 0,94 | 0,70 | erfüllt |
| **Ambiguität** | **0,08** | **≤0,20** | **Gate bestanden** |

### Festgeschriebene Nutzerentscheidungen

- Saldo basiert auf Rechnungen minus bestätigten Zahlungen und Gutschriften.
- Patientenzuordnung ab mindestens 75 % darf automatisch bestätigt werden.
- Eine bestätigte Patientenzahlung reduziert den Gesamtsaldo auch dann, wenn die Rechnungszuordnung noch offen ist.
- Eine Banktransaktion darf auf mehrere Patienten und Rechnungen aufgeteilt werden.
- Patientennamen und Patientennummern im Verwendungszweck sind zentrale Zuordnungsbelege.
