# Praxisergänzung: behandlungsbezogene Abrechnung und Patientenidentität

Stand: 09.10.2026. Grundlage: Gespräch mit Dr. Schubert und Sabine, vom Nutzer hier bereitgestellt. Ergänzt [Abrechnungsupgrade](billing-upgrade.md) und [Patienten-Finanzkonto](patient-finance-ledger-spec.md).

Status: Architekturentscheidung und Umsetzungsauftrag. Die unten beschriebenen neuen Regeln sind noch nicht implementiert oder aktiviert. Aussagen aus dem Gespräch sind Praxisanforderungen; uneindeutige Begriffe und Mengen bleiben ausdrücklich offen.

## 1. Was die Praxis erreichen will

Sabine entscheidet anhand von Behandlungsquartal, eingesetzten Bögen, Behandlungsschritten und bisheriger Abrechnung. Diese Informationen müssen zusammenstehen, damit das System belegte Leistungen vorschlägt und auf Lücken hinweist. Sabine soll fehlende Angaben oder Korrekturen direkt am Fall ergänzen können. Ziel: Dokumentation in Anima-Scribe, Prüfung in Anima Cura, nachvollziehbarer Austausch mit IVORIS und weniger Programmwechsel.

Zweites Ziel: Ein vertauschter Vor- und Nachname im Anamnesebogen darf nicht automatisch eine weitere Patientenakte und einen weiteren Portalzugang erzeugen.

## 2. Aus dem Gespräch abgeleitete Regeln

| Aussage / Wunsch | Verhalten des Systems | Noch zu belegen |
|---|---|---|
| Reverse-Bogen oder T-Loops bedeuten für Sabine 128b. | Begriffe inklusive Schreibvarianten erkennen; einen begründeten 128b-Vorschlag mit Textstelle und erforderlichen Leistungsmerkmalen erzeugen. | Durchführung, Material, Vollbogen, Individualisierung und Kiefer müssen aus dem konkreten Fall hervorgehen. |
| Stärkerer Bogen nach Röhrchensetzung; später B statt A berücksichtigen. | Behandlungsschritte zeitlich zusammenführen und mögliche fehlende Dokumentation oder Abrechnung markieren. | Die Reihenfolge allein bestimmt keinen Gebührencode. |
| Im sechsten/siebten Quartal sind noch Leistungen unberücksichtigt. | Historie und Plan vergleichen; belegte, noch nicht abgerechnete Leistungen zur Prüfung vorlegen. | Ist die bisherige Abrechnung einschließlich Sabines Nacharbeiten vollständig bekannt? |
| 14 oder 16 Bögen, acht Quartale, davon sechs B-Bögen. | Mengen und Laufzeit pro Behandlungsplan speichern, mit Quelle, Version und Bezugsgröße. | Die Gesprächszahlen sind keine allgemeinen Vorgaben. Unklar: pro Patient, Kiefer oder Behandlung und geplant oder genehmigt. |
| Nach zwei A-Bögen soll ein B-Bogen berücksichtigt werden. | Als gewünschten Verlaufshinweis erfassen und mit Fallbeispielen prüfen. | Keine automatische Umklassifizierung des tatsächlich eingesetzten Bogens. |
| Kette / Behandlungsende: alle Leistungen prüfen. | Eine Abschlussprüfung auf fehlende Dokumentation und übersehene erbrachte Leistungen anbieten. | Kette oder dicker Bogen allein bestätigt weder Behandlungsende noch einen Gebührencode. |
| Röhrchen werden als Bänder abgerechnet. | Bauteil, Befestigung, Zahn und Handlung getrennt erfassen; unklare Zuordnung als Prüffall. | Keine pauschale Ersatzregel „Röhrchen = Band“ aktivieren. |
| Ute Müller wird als Müller Ute eingetragen. | Beide Feldreihenfolgen prüfen, bestehende Identität wiederverwenden und die Eingabeabweichung protokollieren. | Geburtsdatum, eindeutiger Treffer und widerspruchsfreie Kennungen; Portalberechtigung separat prüfen. |

Fachliche Grundlage: Der BEMA 2026 unterscheidet bei 128a konfektionierte und bei 128b individualisierte Vollbögen aus Edelstahl. Für 128b nennt er mindestens drei Biegungen zweiter Ordnung oder eine Biegung dritter Ordnung; 126b beschreibt die Eingliederung eines Bandes. Die allgemeinen Bestimmungen verlangen die vollständige Erbringung des Leistungsinhalts. Deshalb erzeugen reine Zeit- oder Restmengenregeln Hinweise, keine zusätzlichen abrechenbaren Leistungen. Quelle: [KZBV, BEMA 01.01.2026, S. 4, 58–59](https://www.kzbv.de/wp-content/uploads/KZBV_BEMA_2026-01-01.pdf).

## 3. Gemeinsame Architektur

```text
Anamnesebogen -> zentrale Identitätsprüfung -> bestehende patients.id / Prüffall
                                                    |
Scribe + belegte IVORIS-Daten + Praxisnachträge ------+
                                                    v
                 Behandlungskonto je Patient und Behandlungsplan
                                                    |
                    Kontextregeln -> erklärbarer Leistungsvorschlag
                                                    |
                          Sabines Prüfung / kurze Ergänzung
                                                    |
                  bestehende versionierte Leistungs- und Tarifprüfung
                                                    |
                  Rechnungsfreigabe -> Portal -> Zahlungsabgleich
```

Patient, Sorgeberechtigter, Rechnungsempfänger und Zahlender bleiben getrennte Rollen. Alle Module referenzieren dieselbe lokale Patienten-ID; externe IDs werden mit Herkunft geführt. Eine abgegebene Anamnese allein beweist keinen laufenden abrechenbaren Behandlungsfall.

### Behandlungskonto

- **Plan:** ID, Version, Gültigkeit, Behandlungsbeginn, geplante Dauer, Kiefer, Leistungsarten, geplante und belegte genehmigte Mengen, Planänderungen und Unterbrechungen.
- **Ereignis:** tatsächliches Leistungsdatum, Handlung, Material, Bogentyp, Stärke, Individualisierungsmerkmale, Region/Zahn, Menge, Behandler, Quelle und Quellversion. Scribe trennt `durchgeführt`, `geplant`, `verneint` und `unklar`.
- **Abrechnung:** vorgeschlagen, fachlich bestätigt, in einem Entwurf reserviert, tatsächlich abgerechnet, korrigiert/storniert. Ein erfolgreicher Karteitext-Export ist kein Nachweis einer abgerechneten Position.
- **Vollständigkeit:** erfasster Zeitraum, vorhandene Quellen und letzte Bestätigung der Historie. Fehlende IVORIS-Historie wird als unbekannt ausgewiesen, nicht als null bisherige Leistungen.

Behandlungsquartal und Kalenderquartal werden getrennt gespeichert. Die Berechnungsregel für das Behandlungsquartal berücksichtigt den dokumentierten Start sowie bestätigte Planänderungen und Pausen; bei fehlender Grundlage bleibt der Wert unbekannt.

Pro Code und Kiefer erscheinen getrennt: geplant, durchgeführt, fachlich bestätigt, abgerechnet und noch zu prüfen. Eine mögliche Abrechnungslücke besteht nur aus belegten, bestätigten Ereignissen, denen noch keine wirksame Abrechnungszuordnung gegenübersteht. Entwurfsreservierungen verhindern eine zweite Verwendung. Mengenvergleiche erfolgen auf eindeutigen Ereignissen und Zuordnungen, nicht durch blindes Subtrahieren von Summen aus mehreren Systemen. Planrest und Abrechnungslücke sind unterschiedliche Werte; negative Differenzen lösen einen Prüfhinweis aus.

### Kontextregeln und Lernen

Eine Regelversion enthält `ruleId`, Gültigkeit, Gebührenbereich, Auslöser, benötigte Fakten, Ausschlussbedingungen, vorgeschlagenen Code, Begründung, Quellenbeleg und fachliche Freigabe. Jedes Ergebnis speichert Regel-, Plan- und Quellversion. Die Übernahme in `billing_records`/`billing_versions` erfolgt über die vorhandene Leistungsprüfung und deren Herkunftssperre.

Beispiel: „T-Loop beim nächsten Termin biegen“ erzeugt einen Planungshinweis. „T-Loop eingesetzt“ erzeugt einen Vorschlag und zeigt noch fehlende Leistungsmerkmale. Ein bereits abgerechnetes identisches Ereignis erzeugt keine weitere Position. Nachträgliche Änderungen an Scribe oder durch Sabine machen betroffene Vorschläge erneut prüfpflichtig; freigegebene historische Belege bleiben erhalten.

Bestätigungen, Ablehnungen und begründete Korrekturen bilden Beispiele für Regelverbesserungen. Das System schlägt eine neue Regelversion vor; diese wird anhand bestätigter Praxisfälle einschließlich Gegenbeispielen geprüft und fachlich freigegeben. Ein einzelnes Gespräch, eine Korrektur oder ein KI-Score aktiviert keine neue Abrechnungsregel. Leistungsart und Preisermittlung bleiben getrennt. GOZ nutzt eigene Tarif-, Faktor-, Mengen- und Begründungsregeln; BEMA-Bogenregeln werden nicht auf GOZ übertragen.

### Arbeitsfläche für Sabine und Schnittstellen

Im bestehenden Abrechnungsbereich je Patient: Behandlungsquartal und Historienstand, Plan-/Leistungsübersicht, vorgeschlagene Positionen und offene Angaben. Details mit Belegtext und Regelbegründung sind aufklappbar. Aktionen: `Bestätigen`, `Korrigieren`, `Nicht erbracht`, `Später geplant`. Häufige Ergänzungen wie Kiefer, Material oder tatsächliche Menge lassen sich direkt am Vorschlag erfassen. Pflichtangaben werden nur dort abgefragt, wo sie fehlen.

Scribe erfasst klinische Fakten einmal; Anima Cura verwendet dieselben Ereignis-IDs. Sabines Nachtrag erhält eine eigene Revision und wird keinem ursprünglichen Behandler als dessen Aussage zugeschrieben. Ein gefundener IVORIS-Karteitext darf nicht als vollständige Abrechnungshistorie ausgegeben werden. Rücklesen und Schreiben von echten Abrechnungspositionen bleiben vom nachgewiesenen Schnittstellenumfang abhängig; jede Verbindung führt getrennte Zustände für gespeichert, übertragen und bestätigt. Wiederholungen sind idempotent, Konflikte mit externen Nacharbeiten bleiben sichtbar. Die interne Erfassung und Prüfung funktioniert auch bei unterbrochener Verbindung.

## 4. Vertauschte Namen und Dubletten

### Eingabe und gemeinsame Zuordnung

Das vorhandene Formular hat bereits getrennte Felder für Vorname und Nachname. Ergänzt werden eindeutige Beispiele, `given-name`/`family-name`-Autofill und vor dem Unterschreiben eine kompakte Zusammenfassung der behandelten Person. Eltern- und Kindernamen dürfen dabei nicht vermischt werden.

Ein gemeinsamer Resolver wird vor jeder Neuanlage verwendet: AnimaSign, lokale Verknüpfung, IVORIS-Import/-Sync, Patientenansicht und Behandlungsansicht. Er liefert explizit `matched`, `possible_duplicate`, `new_candidate` oder `lookup_failed`, inklusive aller Kandidaten, Gründen und Vollständigkeit der Suche.

1. Vorhandene vertrauenswürdige Patienten-/IVORIS-Verknüpfung prüfen. Widersprüchliche stabile IDs führen zur Klärung.
2. Namen für den Vergleich normalisieren: Unicode, Groß-/Kleinschreibung und Leerzeichen. Originalschreibweise behalten; Akzent-/Umlautvarianten als zusätzliche Suchsignale behandeln.
3. Direkte und vertauschte Zuordnung der vollständigen Vor-/Nachnamenfelder vergleichen. Bei einem Freitext-Gesamtnamen nur Kandidaten erzeugen; mehrteilige Namen nicht pauschal alphabetisch sortieren oder am ersten Leerzeichen zerlegen.
4. Eine eindeutige direkte oder vertauschte Übereinstimmung mit gleichem gültigem Geburtsdatum darf intern verknüpft werden, sofern alle relevanten Suchwege vollständig und widerspruchsfrei sind. Verschiedene eindeutige Treffer unterschiedlicher Suchwege ergeben zusammen einen Konflikt.
5. Fehlendes Geburtsdatum, abweichende Kennungen oder mehrere plausible Treffer ergeben `possible_duplicate`. Eine gemeinsame Familien-E-Mail ist keine eindeutige Personenkennung; „gestern angelegt“ ist nur ein Hinweis.
6. Nur `new_candidate` nach vollständig erfolgreicher Suche erlaubt die Neuanlage. Fehler, Zeitüberschreitung und abgeschnittene Trefferlisten dürfen nicht als „kein Patient vorhanden“ behandelt werden. Bei Unsicherheit bleibt der signierte Bogen gespeichert und sichtbar in der Zuordnungsprüfung.

Die Zuordnung einer Anamnese erteilt keinen Zugriff auf eine vorhandene Patientenakte. Portalzugriff erfordert unabhängig davon die vorhandene Authentifizierung bzw. geprüfte Berechtigung. Das öffentliche Formular zeigt keine fremden Bestandsdaten oder Trefferlisten.

### Gleichzeitige Einreichungen und Bestandsbereinigung

Identitätssuche und Anlage werden transaktional abgesichert; parallele Einreichungen mit vertauschten Feldern verwenden denselben praxisbezogenen Sperrschlüssel. Dieser Schlüssel dient nur der Koordination, ist kein Beweis gleicher Identität. Nach dem Sperren werden Kandidaten erneut geprüft. Der Fingerabdruck eines Formulareingangs bleibt von der Personenidentität getrennt: gleiche Person kann mehrere gültige Anamnesen einreichen.

Bestehende Verdachtsfälle zunächst vollständig als lesende Vorschau ermitteln, dann sichere Verknüpfungen bzw. fachlich bestätigte Zusammenführungen durchführen. Anamnesen, Unterschriften, PDFs, Behandlungen, Rechnungen, Zahlungen und Portalrechte bleiben erhalten. Signierte Originale werden nicht nachträglich umgeschrieben; Korrekturen erhalten einen eigenen Vermerk. Vorhandene Verknüpfungen werden bei belegten Konflikten erneut geprüft, nicht ungeprüft wegen „bereits verknüpft“ übersprungen.

## 5. Anschluss an den vorhandenen Code

| Vorhandener Baustein | Erweiterung |
|---|---|
| `src/lib/billing-foundation.ts`, `billing-workspace.ts` | Bestehende Quellen-/Tarif-/Freigabeprüfung weiterverwenden; Plan, Ereignis, Regelversion und Abrechnungszuordnung ergänzen. |
| `src/components/billing/BillingWorkspace.tsx` | Behandlungskonto und kontextbezogene Vorschläge in dieselbe Arbeitsfläche integrieren. |
| `src/lib/services/animasign-local-patient-link.ts` | Gemeinsamen Resolver vor RPC und Fallback-Neuanlage einsetzen; unbekannte Identitätsdaten nicht durch erfundene Ersatzwerte ersetzen. |
| `src/lib/services/animasign-ivoris-directory.ts` | Alle Suchstrategien auf Widersprüche prüfen; nicht beim ersten einzelnen Treffer entscheiden. |
| `src/lib/services/animasign-submit-idempotency.ts` | Formular-Wiederholschutz erhalten; zusätzlich transaktionalen Identitätsschutz vor Anlage vorsehen. |
| `src/components/patient/AnamneseForm.tsx` und `src/lib/services/patient-ivoris-link.ts` | Klare Eingabehilfe und durchgehend dieselben Zuordnungsregeln verwenden. |

Neue Entitäten, zunächst als Entwurf: `treatment_plan_versions`, `treatment_events`, `billing_rule_versions`, `billing_proposals`, `billing_allocations`, `identity_resolutions`. Jede führt Praxisbezug, Autor, Zeitpunkt und Herkunft. Die Integration in die bestehende Datenstruktur wird vor einer Migration geprüft; dieser Auftrag führt keine Migration aus.

Codebefund vom 09.10.2026: Der lokale `findExactLocalPatientId` vergleicht Vor- und Nachname nur gleichgerichtet und begrenzt Geburtstagskandidaten auf 20. Der Formular-Fingerabdruck behält die Feldreihenfolge bei. Das erklärt eine technische Lücke für vertauschte Eingaben, beweist aber ohne Prüfung des konkreten Eingangs und der aufgerufenen Datenbankfunktion noch nicht die Ursache jedes gemeldeten Falls.

## 6. Reihenfolge und Abnahme

1. **P0: Identität absichern.** Resolver und transaktionalen Anlageschutz einführen; vertauschte Namen und bestehende Verdachtsfälle prüfen. Keine zweite Akte allein wegen der Namensreihenfolge.
2. **P1: Behandlungskonto aufbauen.** Pläne, tatsächliche Ereignisse und belegte Abrechnungshistorie pro Patient zusammenführen; fehlende Historie ausweisen.
3. **P1: Kontextregeln erproben.** Reverse-/T-Loop-Erkennung, Quartals- und Abschlussprüfung zunächst im Vergleich mit Sabines bestätigten Fällen, ohne automatische Verbuchung.
4. **P1: Prüfung im Arbeitsablauf.** Kurze Ergänzungen und begründete Freigaben in Scribe/Anima Cura anbinden; GOZ separat berücksichtigen.
5. **P2: Freigegebene Regeln aktivieren.** Versionsverlauf, Rücknahme einer Regel, idempotente Verarbeitung und nachvollziehbare Übertragung nachweisen. Ausstellung und Versand bleiben die gesonderten Schritte des Hauptplans.

| Abnahmefall | Erwartetes Ergebnis |
|---|---|
| Sechstes Quartal, offener B-Planrest, aber kein belegtes B-Ereignis | Prüfhinweis; keine erfundene Leistung. |
| T-Loops geplant, verneint oder nur aus altem Text übernommen | Keine aktuelle Abrechnungsposition daraus. |
| Tatsächliche Individualisierung vollständig dokumentiert | Erklärbarer 128b-Vorschlag; nach fachlicher Prüfung einmalig übernehmen. |
| Röhrchen erwähnt, Bauteil/Befestigung unklar | Gezielte Rückfrage am Fall, keine automatische Bandposition. |
| Nachtrag oder Storno verändert einen bereits verwendeten Beleg | Neuberechnung der offenen Prüfung; Historie erhalten, keine Doppelabrechnung. |
| IVORIS-Historie nicht vollständig abrufbar | Vollständigkeit unbekannt, keine vermeintlich sichere Restmenge. |
| Ute/Müller und Müller/Ute, gleiche Person eindeutig belegt | Eine Patientenakte, alle Anamnesen verknüpft. |
| Namensgleichheit, Zwillinge, Familien-E-Mail oder widersprüchliche IDs | Keine automatische Zusammenführung oder Portalfreigabe. |
| Doppelte parallele Einreichung, auch mit vertauschten Feldern | Eine Anlage; wiederholbare Verarbeitung ohne zusätzliche Konten. |
| Suchausfall, Trefferlimit oder bereits falsch verknüpfter Eingang | Sichtbare Klärung statt ungeprüfter Neuanlage oder Erfolgsmeldung. |

Fachlich noch offen: fallbezogene Bogenmengen und deren Bezugsgröße, Zählweise der Behandlungsquartale, konkrete Röhrchen-/Bandfälle sowie bestätigte Positiv- und Gegenbeispiele für Reverse-/T-Loop-Regeln. Diese Punkte sperren die jeweilige automatische Regel, nicht die Umsetzung der Identitätsprüfung und des Behandlungskontos.
