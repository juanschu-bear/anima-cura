# A2a – Rückgabenprüfung gegen das Bankarchiv

Stand: 31.10.2026. Nur lesende Prüfung und Korrektur irreführender Anzeigen. Keine produktive Finanzumbuchung.

## Ursache und Abgrenzung zu A1

`src/lib/services/bank-sync.ts` archiviert alle Vorzeichen in `bank_transactions_raw`, übernimmt in `transaktionen` aber ausschließlich `amount > 0`. Der bisherige Rücklastschrift-Abschnitt in Zahlungen filterte nur die gerade geladene, paginierte Zahlungsliste auf negative Werte. Diese Datenquelle kann die archivierten Rückgaben nicht vollständig zeigen.

Der Leitstand-Fix A1 entfernt den positiven Anzeigefilter in der patientenbezogenen Liste, bringt aber noch keine Archiv-Abgänge in die Zahlungs-Verarbeitung. Insbesondere dürfen ein leerer Filter oder ein bezahlter gespeicherter Ratenstand nicht als erfolgreich durchgeführter Rückgabenabgleich ausgegeben werden.

## Neue Implementierung

- `src/lib/payment-return-review.ts`: deterministische, seiteneffektfreie Prüfungslogik.
- `scripts/audit-bank-returns.ts`: explizit kontobezogener, ausschließlich lesender Betreiber-Audit. Keine Patienten-/Banknamen, Kennungen, Verwendungszwecke oder Referenzwerte in der Ausgabe. Kein Manifest und kein `--apply`.
- Exakte Referenz, gleiches Konto/Verbindung/Währung und zeitlich passende Ursprungsbuchung werden geprüft. Kein Name-/Betrags-Fuzzy-Matching, keine Interpretation unbekannter Bankcodes.
- Soweit belegt, werden bestehende Patientenzuordnungen, Rechnungszuordnungen und Rate-Transaktionsverweise geprüft. Fremde Patienten, Teilzuordnungen, frühere Entscheidungen, Stornos, Mehrfachrückgaben und geänderte Quellen verhindern einen vermeintlich fertigen Befund.
- Alle Ergebnisse bleiben `canApply: false`. Auch `evidence_linked` heißt nur: vorhandene Belegkette gefunden, nicht: fachlich freigegeben oder atomar verbucht. Fehlende Rechnungs-/Ratenverweise werden nicht ergänzt.
- Teilrückgaben und abweichende Beträge werden nicht auf volle Stornos abgebildet. Aus der Differenz wird insbesondere keine Bankgebühr abgeleitet.
- Die bisher fest angezeigten **+3,50 €** ohne Gebührenbeleg sind entfernt. Deutsche/englische Texte in Zahlungen und Mahnwesen benennen den noch nicht angebundenen Abgleich, statt automatische Erkennung und falsche Entwarnung zu versprechen. Keine Layout-Neugestaltung.

## Lesender Produktionsbefund

Prüfung des im bestehenden Bank-Sync festgelegten Praxiskontos am 31.10.2026, 02:47:04 bis 02:47:10 Europe/Berlin:

| Befund | Anzahl |
|---|---:|
| Archivbuchungen dieses Kontos, komplette vorhandene Historie | 16.185 |
| Negative Archivbuchungen dieses Kontos | 759 |
| Negative Buchungen mit den unterstützten textlichen Rückgabe-Hinweisen | 539 |
| Davon ohne verwendbare End-to-End-Referenz | 395 |
| Davon mögliche eindeutige Ursprungsbuchung per Referenz, aber Betragsabweichung | 144 |
| Durch die vollständige strenge Prüfstrecke verknüpft | 0 |
| Schreiboperationen / automatische Stornos | 0 |

Die zuerst erhobenen 2.680 negativen Archivzeilen bezogen sich auf das gesamte Archiv, nicht auf dieses konkrete Konto. In `transaktionen` waren bei der separaten Vorabzählung insgesamt 0 negative Zeilen enthalten. Diese verschiedenen Bezugsgrößen nicht miteinander vermischen.

539 ist weder die Zahl bestätigter Rücklastschriften noch ein aktueller Arbeitsstapel neuer Fälle. Textmarker sind Hinweise; nicht unterstützte Formate können fehlen. Der Audit ist eine sequenzielle, nicht transaktional eingefrorene Leseaufnahme und darf niemals als Umbuchungsauftrag verwendet werden.

## Tests / Freigabestand

- 14 neue Tests: exakte Kette, Seiteneffektfreiheit/Wiederholung, gewöhnliche Abgänge, Negationen, strikte Cent-Beträge, fehlende/Platzhalter-Referenzen, Konto-/Währungs-/Datums-/IBAN-Konflikte, wiederverwendete Referenzen, Teilrückgabe, Betragsabweichung, doppelte Rückgabe, geänderte Quelle, frühere Stornos, Familienaufteilungen, Rechnungs-/Ratenkonflikte, fehlende Links, gebührenfreie Anzeige und lesender Auditvertrag.
- Vollständige `npm test`-Kette bestanden: 287 Tests, davon 14 neue Rückgabenprüfungen; zusätzlich 42 RPC-Aufrufstellen geprüft, keine Vertragsverletzung.
- Produktions-Schemacheck am 31.10.2026 um 02:48:15 Europe/Berlin grün. Die bereits ausdrücklich akzeptierten `supabase_admin`-Standardrechte werden weiter als Plattformwarnung ausgewiesen; nicht verändert.
- Abschließender `npm run build` nach allen Code- und Textänderungen erfolgreich, einschließlich Typprüfung und Erzeugung der 92 Seiten. Der lokale Build umfasst den bestehenden Worktree; veröffentlicht werden ausschließlich die sechs Dateien dieses Schritts über Git. Der isolierte Produktions-Build wird separat geprüft.
- Keine neue Rolle, kein Schema, keine Migration, keine Änderung am Bank-Sync, Matcher, Ratenplan oder Mahnlauf. Vorhandene fremde Worktree-Änderungen bleiben unangetastet und werden nicht mitcommittet.
- Deployment und fachliche Abnahme werden getrennt nachgewiesen; keine fertige automatische Rücklastschriftverarbeitung behauptet.

## Veröffentlichung und CI-Nachprüfung

- Implementierung: Commit `bace700` auf `origin/main`. Git-basierter Produktions-Build erfolgreich: `dpl_2jqGtX41FnJyZiHE6eEfsXGhHT1a`, https://anima-cura-ji0bq8mwr-juanschu-bears-projects.vercel.app, Alias https://animacura.io.
- Angemeldete Live-Sichtprüfung unter `/zahlungen`: neue Überschrift „Bankrückgaben · Prüfstand“ und der ausdrückliche Hinweis, dass eine leere Zahlungsliste keine fehlenden Rücklastschriften beweist, sichtbar. Keine Synchronisierung oder finanzielle Aktion ausgelöst.
- Erneuter Produktions-Schemacheck nach Veröffentlichung am 31.10.2026, 02:51:59 Europe/Berlin: grün, einschließlich 42 RPC-Verträgen.
- GitHub-Lauf `41157242110` stoppte dagegen bei drei bereits bestehenden Typfehlern im Zimmer-Test: SQL-Abfrageergebnisse aus PGlite waren als `unknown` typisiert (`scribe-rooms.test.ts`, drei Zugriffe auf `zimmer_version_id`). Das ist kein Fehler in der neuen Rückgabenlogik und kein JSON-/API-Fehler. Vercel veröffentlichte unabhängig vom GitHub-Testlauf; der erfolgreiche Build allein ist deshalb keine vollständig grüne CI-Abnahme.
- Eng begrenzte Korrektur: drei SQL-Abfragen im Test erhalten den Ergebnistyp `{zimmer_version_id: string | null}`. Keine Assertion entfernt, kein Test abgeschwächt, kein Produktionscode für Zimmer verändert. Lokale Typprüfung, alle sieben Zimmer-/Praxiswissen-Tests und abschließender Folge-Build bestanden. Die neue GitHub-Prüfung wird vor Abschluss kontrolliert.
- Fachliche Abnahme der automatischen Finanzkorrektur: **offen / nicht implementiert**. Sämtliche echten Zahlungen, Rechnungsstände und Raten blieben unverändert.

## Nächster Schritt A2b

1. Die 144 Betragsabweichungen aus den vorhandenen Bankinformationen aufschlüsseln: ursprünglicher Hauptbetrag, tatsächlicher Abgang, separat belegte Zusatzkosten. Eine höhere Rückgabe allein berechtigt nicht zur Belastung des Patienten mit der Differenz.
2. Bei den 395 fehlenden Referenzen weitere tatsächlich vorhandene Bankreferenzen bzw. Rückgabebelege auswerten. Dauerhaft gleiche Mandatsnummer, gleicher Betrag oder Elternname darf nicht willkürlich eine von mehreren Raten auswählen. Zunächst Betreiberprüfung, keine ungefilterte 539-Fälle-Aufgabe an Sabine.
3. Erst aus bestätigter Rückgabe und eindeutiger Ursprungszahlung einen atomaren Korrekturbefehl entwickeln: Ursprung sperren; Belege erneut prüfen; Rechnungszuordnungen vor Patientenzuordnung stornieren; Raten-/Forderungsstände aus der belegten Kette aktualisieren; Wiederholung sicher erkennen; unveränderlichen Ergebnisbeleg schreiben.
4. Vor Live-Ausführung Tests mit zwei Datenbankverbindungen für gleichzeitige Rückgabe/Zahlungszuordnung, Teilrückgabe, Gebühren, Rollback und unveränderte echte Quellen. Bestehende Ledger-Trigger erlauben nur vollständige spiegelnde Stornos; Teilfälle benötigen ein gesondert geprüftes Modell, keine Umgehung.
5. Patientenhinweis und Mahnprozess erst an das verbuchte Ergebnis knüpfen. Im aktuellen Schritt wurde kein Patient kontaktiert und kein Worker gestartet.
