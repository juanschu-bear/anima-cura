# Abrechnungsupgrade – verbindliche Grenzen und Reihenfolge

Stand der Planung: 2026-10-08; Umsetzungsstand ergänzt am 25.10.2026. Dieser Plan ist keine Freigabe zum Versand von Rechnungen.

Ergänzung vom 09.10.2026: [Praxisregeln für behandlungsbezogene Abrechnung und sichere Patientenidentität](practice-billing-identity-addendum.md). Sie erweitert diesen Plan um Behandlungskonten, nachvollziehbare Bogen-/Quartalsvorschläge, regelbezogenes Lernen nach fachlicher Freigabe und die Erkennung vertauschter Vor-/Nachnamen. Status: spezifiziert, noch nicht implementiert.

## Unveränderliche Regeln

- Identität: Die bestehende `patients.id` ist der gemeinsame Bezug. Patient, Rechnungsempfänger und Zahlender sind unterschiedliche Rollen. Keine automatische Zusammenführung anhand eines Namens.
- Evidenz: Jeder Leistungsvorschlag hat Quelle, Quellversion und Position in der Quelle. Dokumentationsbestätigung ist keine Rechnungsfreigabe. Fehlende oder mehrdeutige Angaben werden nicht durch Standardwerte ergänzt.
- Preise: Tarifquelle, Gültigkeitszeitraum, Gebührenbereich und gegebenenfalls Kostenträger müssen feststehen. Keine Paketauswahl aus einem ähnlichen Gesamtbetrag. Eine Summenliste kontrolliert, beweist aber keine Einzelpositionen.
- Ausstellung: Genau ein ausstellendes System je Rechnung. Nummer und unveränderlicher Rechnungssnapshot werden erst bei einer atomaren Freigabe gespeichert. Erneute Aufrufe dürfen keine neue Rechnung oder Nachricht erzeugen.
- Geld: Alle Ansichten verwenden dieselbe bestätigte Zahlungszuordnung. Patientenbezogene Guthaben und noch nicht zugeordnete Zahlungen bleiben sichtbar. Keine mehrfach verwendeten Zahlungseingänge.
- Sicherheit: Ein Entwurf wird nicht versendet, nicht als Forderung verbucht und nicht angemahnt. Fehler halten den betroffenen Fall an. Unbekannt ist weder bezahlt noch offen.

## Inkremente und Abnahme

1. **Evidenz und sichere Entwürfe:** strukturierter, testbarer Prüfvertrag; Scribe-Adapter ohne erfundene Mengen; lesende Prüfung mit expliziten Datenlücken; unsicheren Generator ersetzen; Vorschau eindeutig als Entwurf kennzeichnen. Keine Änderungen an Patienten, Zahlungen oder ausgestellten Rechnungen.
2. **Persistente Leistungs- und Tarifversionen:** getrennte fachliche Bestätigung, Quelle/Revision, exakte Dezimalberechnung und datumsbezogene Tarife. Nacharbeiten aus IVORIS benötigen einen nachgewiesenen Rückweg. Vergleich gegen freigegebene Praxisbeispiele, zunächst ohne Versand.
3. **Quartalsabgleich:** Listenimporte mit Prüfsummen und Herkunft, eindeutige Patientenzuordnung, centgenaue Summenkontrolle, vollständige Ausnahmeübersicht. Fehlende Positionen bleiben sichtbar.
4. **Ausstellung und Portal:** transaktionale Nummernvergabe, Idempotenz, unveränderliches PDF, Empfängerberechtigung, Korrektur/Storno und einmalige Benachrichtigung. Bestehende Originalrechnungen nicht erneut ausstellen.
5. **Einheitliches Patientenkonto:** bestehende Zahlungsledger-Bausteine über alle Ansichten integrieren; Bankfrische, Familienzahlungen, Teilzahlungen, Guthaben, Lastschriften und Rückbuchungen prüfen.
6. **Betrieb und Freigabe:** durchgängige Tests einschließlich Doppelaufrufen und fremden Portalzugriffen; Fehleralarme, Wiederholungen, Wiederherstellungstest und stufenweise Aktivierung.

Erst nach der jeweiligen Abnahme darf ein Inkrement als produktiv abgeschlossen gelten. Das Vorhandensein von Code oder ein erfolgreicher Build beweist weder korrekte historische Daten noch vollständige Abrechnungen.

### Einordnung der Praxisergänzung

- **P0, vor weiteren automatischen Patientenanlagen:** gemeinsamer Identitätsresolver einschließlich vertauschter Namen, vollständiger Kandidatensuche, Konfliktprüfung und transaktionalem Wiederholschutz. Eine Anamnesezuordnung erteilt keine Portalberechtigung.
- **Inkrement 2a, aufbauend auf den Leistungs-/Tarifversionen:** versionierter Behandlungsplan, belegte Ereignisse, Abrechnungshistorie und erklärbare Kontextregeln in der vorhandenen Prüfoberfläche. Planrest löst keine automatische Leistung oder A/B-Umklassifizierung aus.
- **Inkrement 3:** Quartalsabgleich um mögliche übersehene, tatsächlich erbrachte Leistungen erweitern. Unvollständige Historie ausdrücklich anzeigen; BEMA und GOZ getrennt prüfen.
- **Inkremente 4–6:** nur bestätigte Positionen weiterreichen; Herkunft, Regelversion, Korrekturen und Doppelverwendung durchgängig prüfen. Die konkreten Abnahmefälle stehen in der verlinkten Ergänzung.

## Stand des ersten Inkrements

Implementiert: lesende, berechtigungsgeprüfte Abrechnungsprüfung am bestehenden Patientenaufruf; paginierter Scribe-Quellabruf; Positionsvertrag mit Herkunft/Version, datiertem Tarif und exakter Centberechnung; strikter Scribe-Kopierexport ohne Mengenannahmen; sichere Entwurfsanzeige ohne zufällige Rechnungsnummer oder Zahlungsaufforderung. Datumswerte bleiben unabhängig von der Browserzeitzone am richtigen Leistungstag. Ein pauschaler BEMA-Eigenanteil wird nicht auf GOZ-Positionen angewandt.

Prüfnachweise: automatisierte Tests für Rechenregeln, Quellenlücken, Dubletten, Berechtigungen, Fehlerantworten und Entwurfsdaten; vollständiger Produktionsbuild; isolierte Browserprüfung der tatsächlichen Vorschaukomponente mit synthetischen Daten auf Desktop, Mobilgerät und im Druck. Die zusätzlichen Abrechnungstests laufen künftig mit `npm test`.

Noch nicht enthalten: persistenter Tarifkatalog/Positionseditor, vollständiger IVORIS-Rückabgleich, Quartalslistenimport, transaktionale Rechnungsausstellung und Veröffentlichung im Patientenportal. Bestehende Paketpreise im Entwurfseditor sind keine neu geprüften Tarife. Der Status `ready_for_review` ist ausschließlich eine technische Vorprüfung, keine Abrechnungsfreigabe oder Zusicherung rechtlicher Vollständigkeit. Die browserseitige Prüfung ersetzt keinen authentifizierten Produktions-Durchlauf mit freigegebenen Praxisbeispielen.

Dieser Ausbauschritt führt keine Datenmigration aus, ändert keine Patientensalden und erstellt oder versendet keine Patientenrechnungen.

## Stand des zweiten Inkrements

Implementiert: persistente, unveränderliche Versionen für Tarifnachweise und einzelne Leistungspositionen; eindeutige Herkunft aus Scribe, IVORIS, Praxisimport oder manuellem Beleg; Schutz vor einer zweiten Erfassung derselben Quellposition; optimistische Versionssperre; idempotente Schreibaufrufe; serverseitige Berechnung und erneute Quellenprüfung bei der fachlichen Freigabe. Korrekturen erzeugen neue Versionen und erhalten den bisherigen Verlauf. Schreibrechte werden sowohl am API-Zugang als auch innerhalb der Datenbanktransaktion geprüft.

Die Oberfläche trennt Tarif, Leistungsentwurf, Versionsverlauf, fachliche Freigabe und Rechnungsausstellung. Bestätigte Scribe-Einträge erscheinen ausschließlich als Vorschläge. Fehlende Menge, Einzelcode, Tarif, Kassenkennung, Region, GOZ-Faktor oder Begründung verhindern die Freigabe. Der angezeigte Leistungsbetrag ist kein bestätigter Patientensaldo. Diese Stufe stellt weiterhin keine Rechnung aus und versendet nichts.

Prüfnachweise: isolierte echte PostgreSQL-Tests der Migration einschließlich paralleler Änderungen, Wiederholungen, Rechte, unveränderlicher Historie, Dublettensperre, falscher Summen und veralteter Scribe-Quellen; API-Tests für Anmeldung, Herkunft, Browserursprung, serverseitige Betragsberechnung und sichere Fehler; vollständiger Projekt-Testlauf und Produktionsbuild; synthetische Browserprüfung auf Desktop und Mobilgerät.

Produktiv aktiviert wurden ausschließlich die drei neuen, zunächst leeren Abrechnungstabellen und die zugriffsgeschützte Schreibfunktion. Bestehende Patienten, Rechnungen, Zahlungen, offene Posten und Nachrichten wurden dabei nicht verändert. Reale Tarife und Leistungsfreigaben müssen erst mit Praxisbelegen erfasst werden.

## Ausstellung und Portal – Stand 25.10.2026

Implementiert sind eine getrennte, versionierte Kostenträgerentscheidung und die explizite Rechnungsausstellung mit Jahresnummer, unveränderlichem Snapshot und privatem PDF. Forderung, Patientendokument und Portal-Benachrichtigung werden gemeinsam gebucht. Wiederholungen setzen dieselbe Ausstellung fort. Es erfolgt dabei kein automatischer E-Mail-Versand.

Zusätzlich bindet eine Datenbanksperre jede logische Leistungsposition an genau eine Rechnung. Ein neuer Kostenträgerstand oder ein überlappender Zeitraum erlaubt keine zweite Ausstellung derselben Leistung. Vor der endgültigen Buchung werden Leistungsrevision, Kostenträgerstand und vorhandene Scribe-Quelle erneut unter Transaktionssperren geprüft. Änderungen stoppen die Veröffentlichung vollständig. Reservierte Positionen bleiben bis zur Klärung gebunden; ein bloßer Fehler löst die Bindung nicht automatisch.

Prüfnachweise: 69 erfolgreiche Abrechnungstests einschließlich doppelter Kostenträgerentscheidung, zurückgerollter Veröffentlichung nach Leistungs-/Quelländerung, idempotenter Wiederholung, unveränderlicher Rechnung und gesperrtem direkten Löschzugriff; erfolgreicher Produktionsbuild. Die Schutzmigration übernimmt vorhandene Rechnungsbindungen und bricht bei überlappenden historischen Bindungen vollständig ab.

Storno/Korrektur ergänzt: Eine unbezahlte ausgestellte Rechnung kann begründet und nach ausdrücklicher Bestätigung vollständig storniert werden. Unveränderlicher Stornobeleg, Aufhebung der Forderung, Mahnsperre, Portalbereitstellung und Freigabe der Leistungsbindungen erfolgen gemeinsam. Der Originalbeleg bleibt erhalten. Bei zugeordneten Zahlungen, Teilzahlungen oder veränderten Forderungswerten wird das Storno gesperrt; es erfolgen keine automatischen Rückzahlungen oder Umbuchungen. Neue Zahlungszuordnungen und ein Wiederöffnen stornierter Forderungen sind gesperrt. Eine anschließend mit neuer Kostenträgerrevision ausgestellte Korrekturrechnung erhält eine eigene Nummer sowie einen Bezug zum stornierten Original in Datenbank, Oberfläche und PDF.

Prüfnachweise dieses Schritts: 73 erfolgreiche Abrechnungstests einschließlich blockiertem Storno bei Zahlungszuordnung/Teilzahlung, reversierter Zuordnung, idempotentem Storno, unverändertem Originalsnapshot, gesperrter Wiederöffnung und verknüpfter Korrekturausstellung; Produktionsbuild; visuelle Prüfung synthetischer Storno-/Korrektur-PDFs. Die lokale Browserprüfung der Oberfläche wurde durch die Browser-URL-Richtlinie für file:// blockiert und bleibt offen.

Abgebrochene Vorbereitungen ergänzt: Eine ausschließlich reservierte Ausstellung kann begründet aufgehoben werden. Die Leistungsbindungen werden freigegeben, ohne Forderung, Patientendokument oder Benachrichtigung zu erzeugen. Nummer, Snapshot und Aufhebungsgrund bleiben unverändert dokumentiert. Eine verspätete Veröffentlichung der aufgehobenen Vorbereitung wird abgewiesen. Bei einer abgebrochenen Korrektur wird auch der Korrekturplatz des tatsächlich ausgestellten Originals wieder frei; die nächste Ausstellung benötigt einen neuen freigegebenen Kostenträgerstand und erhält eine neue Nummer. Veröffentlichte Rechnungen oder bereits vorhandene Veröffentlichungsartefakte verhindern die Aufhebung.

Der Ausstellungsverlauf zeigt alle Vorbereitungen, Aufhebungen, Rechnungen und Stornos des gewählten Patienten/Zeitraums mit 15 Einträgen pro Seite. Historische abgebrochene Vorbereitungen können dort ebenfalls gezielt aufgehoben werden. Original- und Stornobelege bleiben aufrufbar, sofern sie veröffentlicht wurden. Prüfnachweise: 76 erfolgreiche Abrechnungstests einschließlich gesperrter verspäteter Veröffentlichung, idempotenter Aufhebung, unveränderlichem Aufhebungsverlauf, erneut möglicher Korrektur mit eigener Nummer sowie patienten-/zeitraumbezogener Verlaufspaginierung.

Noch offen: Storno bei bezahlten Rechnungen mit freigegebener Guthaben-/Umbuchungslogik, einheitliche Einbindung in das Patientenzahlungskonto sowie ein authentifizierter Praxisdurchlauf mit freigegebenen realen Abrechnungsbeispielen. Die Rechnungsausstellung allein bedeutet keine vollständige fachliche Abnahme der Gesamtabrechnung.

## Patientenkonto: sichere Vereinheitlichung der Bestandsberechnung

Die lesende Produktionsprüfung zeigt 46 bestätigte Patienten-Zahlungszuordnungen und keine Rechnungszuordnungen im neuen Journal gegenüber 19.931 positiv zugeordneten Bestands-Banktransaktionen. Das Journal ist damit noch keine vollständige Grundlage für historische Kontostände. Ein Wechsel ohne belegten, dublettenfreien Abgleich bleibt gesperrt; Anima Balance ist ein separates Guthabensystem und wird nicht pauschal addiert.

Die gemeinsame Ratenberechnung berücksichtigt jetzt `bezahlt_betrag`: Teilzahlungen werden nicht gleichzeitig als vollständige Zahlung und vollständige Restschuld gezählt. Summen werden in Cent aggregiert. Stornierte Forderungen zählen weder als Schuld noch als Zahlung; erledigte Raten erzeugen keinen weiteren Mahnstatus. Patientenübersicht und Ratenplan-API nutzen dieselbe Rechenfunktion; die nächste teilweise bezahlte Rate zeigt nur den Rest. Lesefehler werden nicht mehr in diesem Ratenplan-Endpunkt oder der Patientenliste als leere Finanzdaten beziehungsweise als historische Ratenschuld ausgegeben. Prüfposten bleiben in der Patientenliste ausdrücklich von einer bestätigten Schuld getrennt und verhindern einen Rückfall auf ältere Ratensummen.

Prüfnachweise: Regressionstests für Teilzahlungen, Centaggregation, konsistente Raten-/Rechnungssummen, Storno, Überzahlung und Prüfposten sind Bestandteil von `test:payment-ledger`. Weiter offen bleiben vollständige Bestandsübernahme, Familien-/Sammelzahlungen, Rückbuchungen, einheitliche Zahlungshistorie, Bankfrische und die Abnahme realer Kontobeispiele. Diese Änderung bestätigt keine historische Bankzuordnung.

### Historischer Zahlungsabgleich: lesender Nachweis

Der erweiterte Audit prüft vorhandene Journalzuordnungen einschließlich Gegenbuchungen, belegte Kandidaten und bestehende Patientenzuordnungen getrennt. Bereits belegte volle Zahlungen, Teil-/Familienzuordnungen, Überbelegungen, widersprüchliche Identitäten und frühere Entscheidungen erhalten eigene Zustände. Frühere Ablehnungen oder Gegenbuchungen werden nicht durch erneuten Import aufgehoben. Eine Übernahmekandidatur erfordert eine bestätigte Bestandszuordnung (`auto`/`manuell`) und einen zusätzlichen Nummernbeleg; ein Name allein reicht nicht. Zahlenfragmente in längeren Nummern sind kein Rechnungsnachweis. Der Audit liest stabil nach ID paginiert, berücksichtigt auch ungesetzte Matching-Status und erlaubt keine `--apply`-Schreiboperation mehr. Eine spätere Übernahme braucht einen transaktionalen, gegen zwischenzeitliche Änderungen geschützten Pfad.

Produktionsdurchlauf: 21.734 positive, nicht ausdrücklich ignorierte Transaktionen; 6.730 Übernahmekandidaten (49.650.760 Cent), 80 widersprüchliche Zuordnungen (18.225.636 Cent), 14.924 weitere Eingänge mit unzureichender oder mehrdeutiger Evidenz für diese strikte Übernahme. Alle 46 vorhandenen Journalzeilen haben keinen Banktransaktionsbezug; sie sind kein Nachweis historisch übernommener Bankeingänge. Es wurden keine Kontostände, Zuordnungen oder Patientennachrichten verändert. Die Gruppen beschreiben technische Migrationsbereitschaft, weder unbezahlte Rechnungen noch einen finanziellen Schaden. Die übrigen Fälle werden nicht an die Praxis delegiert, sondern bleiben Teil des technischen Bestandsabgleichs.

### Transaktionale Übernahme belegter Bankeingänge

Migration 057 ergänzt eine nur für den bestehenden internen Servicedienst ausführbare Importfunktion. Der lesende Audit kann mit `--manifest` eine lokale Datei mit eingeschränkten Dateirechten erzeugen; er selbst bleibt schreibfrei. Vor und nach der Kandidatenermittlung wird derselbe Fingerabdruck des Identitäts-/Rechnungsreferenzkatalogs geprüft. Die Importfunktion sperrt diesen Katalog während eines Teilblocks, sperrt jede betroffene Banktransaktion und vergleicht deren Betrag, Status, Patientenzuordnung, Absender und Verwendungszweck mit dem geprüften Snapshot. In diesem ersten Lauf werden ausschließlich eindeutige Patientennummern mit bestätigter Bestandszuordnung übernommen, keine reinen Namens- oder Rechnungsnummernvorschläge.

Jeder Journaleintrag trägt `verified-bank-v1:<Transaktions-ID>` sowie den Quellen-Snapshot. Bereits vorhandene Einträge, frühere Entscheidungen, Teilzuordnungen und Gegenbuchungen verhindern einen neuen Import. Derselbe vollständige Import kann ohne doppelte Einträge wiederholt werden. Fehler rollen den ganzen Teilblock zurück; bereits abgeschlossene Teilblöcke bleiben erhalten. Bei einem Datenbank-Zeitlimit reduziert der Lauf die Blockgröße automatisch. Änderungen am Katalog erfordern einen neuen Audit. Die 46 vorhandenen Kassenbelege sind durch ihre separate Quelle identifiziert und bleiben unverändert. Rechnungen, Forderungsstände, Mahnungen, Bankzuordnungen und Patientennachrichten werden nicht verändert.

Prüfnachweise: echte SQL-Ausführung in isolierter Datenbank für Wiederholungen, doppelte Quellaufrufe, veränderte Quellen/Kataloge, doppelte und mehrere Patientennummern, frühere Ablehnungen, Gegenbuchungen, vollständige Teilblock-Rücknahme und ausgeschlossene öffentliche Ausführung. Der Produktions-Schemacheck prüft die leere Importanforderung als schreibfreie Negativprobe. Die spätere Rechnungskontozuordnung und Umschaltung der Ansichten bleiben separate, weiterhin erforderliche Schritte.

Produktionsübernahme abgeschlossen: 6.473 eindeutige historische Bankquellen mit 45.485.516 Cent wurden zusätzlich im internen Journal erfasst; die 46 bestehenden Kassenquellen blieben erhalten (6.519 Journalzeilen insgesamt). Der erste Lauf erreichte nach 700 erfolgreichen Einträgen das Statement-Zeitlimit; der betroffene Teilblock wurde vollständig zurückgenommen. Nach beschleunigter Nummernprüfung wurden die übrigen 5.773 übernommen. Ein anschließender vollständiger Wiederholungslauf meldete 0 neue und 6.473 bereits übernommene Einträge; die zeilenweise Nachprüfung bestätigte 6.473 Quellen und exakt 45.485.516 Cent. Der erneute lesende Audit bestätigt diese Quellen als abgedeckt. Dies ist keine neue Zahlung, keine bestätigte Begleichung aller Rechnungen und keine Freigabe des Gesamtkontos. Die 257 weiteren Übernahmekandidaten ohne Patientennummernbeleg sowie die übrigen ungeklärten Fälle bleiben außerhalb dieses automatischen Imports.
