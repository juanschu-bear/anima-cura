# AnimaHost Retrieval · Abschlussstand 23.11.2026

## Ergebnis

**Implementierung bereitgestellt, Abnahme noch nicht abgeschlossen. Production bleibt ausgeschaltet.** Keine Freigabeempfehlung auf Grundlage dieses Teilstands. Weitere Versuche wurden beendet; es läuft kein Modelltest im Hintergrund.

| Prüfung des endgültigen Codes | Nur freigegebene Quellen | Mit 51 Entwurfs-Wissenseinträgen |
|---|---:|---:|
| Abgeschlossene Fälle / geplant | 99/239 | 55/239 |
| Modell-Median einschließlich Embedding/Suche | 6.71 s | 7.38 s |
| Patientenanliegen ohne inhaltliche Antwort | 4/54 (7.4 %) | 1/34 (2.9 %) |
| Ausgeschlossene Live-Fälle | 5/39 | 5/39 |
| Technischer Fehler | 1 | 0 |

Alle **39 Live-Fälle** wurden in beiden Modi abgeschlossen: Ausschlüsse **22 → 5** gegenüber 0365400. Das sind drei konfigurierte Teamfälle sowie eine technische Rundnachricht und eine Krankmeldung zur eigenen Arbeit. Der Schmerzfall wird nicht mehr ausgeschlossen. Die ursprünglichen 139 Fälle plus 100 zusätzliche Archivfälle sind vorbereitet; noch nicht ausgeführte Fälle stehen in der Messwertdatei ausdrücklich als `not_run`.

**Das Ziel unter 5 % ist nicht nachgewiesen:** Im freigegebenen Teilbestand liegt die Quote bei 7,4 %. Die 2,9 % im kleineren Entwurfs-Teilbestand sind keine Abnahme der 239 Fälle. Der Laufzeit-Median liegt im bisher geprüften Teilbestand unter 8 Sekunden.

## Offene Qualitätsbefunde

- **L32:** Im Lauf ohne Entwurfswissen wurde die Bitte um Löschen eines alten Termins fälschlich als Abschluss behandelt. Mit Entwurfswissen korrekt weitergegeben.
- **A06:** Eine kurze Zustimmung wurde still behandelt; im konservativen Prüfnenner bleibt sie als offenes Anliegen gewertet.
- **A24:** Antwort vorhanden, vom Kern selbst nicht als inhaltliche Hilfe bewertet.
- **A35:** Ungültige Modell-JSON-Antwort; zurückgehalten statt versendet.
- **A12:** Antwort auf eine als Abschluss eingeordnete Nachricht in beiden Teilbeständen. Weitere Fälle müssen vollständig geprüft werden.
- **L14:** Ohne Entwurfswissen steht noch die technische Schreibweise „rueckmeldezeit:“ im Antworttext. Mit Entwurfswissen ist die Formulierung besser. Deshalb trotz bestandenem Sicherheitsprüfer keine pauschale Qualitätsfreigabe.

## Was umgesetzt ist

- Neuer Antwortkern ohne fachlichen Regel-ID-Entscheidungsbaum und ohne Themen-Fallbacks. Einmalige Nachbesserung, danach erneute Prüfung aller harten Grenzen. Der Prüfer darf eine fehlende Teamweitergabe nur mit einer wörtlichen Stelle aus der Antwort beanstanden.
- Drei getrennte Quellen: 6 bevorzugte Goldbeispiele, Wissensbasis und 87 aktuelle Regeltexte als Fakten, 1.686 aktive anonymisierte Patient–Team-Paare als Praxisabläufe. Archiv: 770 Chats, aktueller Export 8.044 Nachrichten; konservativ nur menschliche Antworten vor der Kopplung am 21.11.2026.
- Namen/Kennungen vor Indexierung entfernt; zusätzliche Namensprüfung extrahiert nur weitere zu entfernende Stellen. Keine Umschreibung der Fakten. Die 51 Wissenseinträge bleiben unverändert Entwurf (0 freigegeben).
- Quellenbelege mit Referenz, Version und Datum getrennt gespeichert. API für Anzeige und Goldmarkierung samt automatischer Indexierung ist im Vertrag für Claude beschrieben. Oberfläche bleibt Claudes Aufgabe.
- Reaktionen, leere Nachrichten und eindeutige Abschlüsse bleiben still; erste Sticker/Emoji begrüßen einmal. Ein Fehler, der ein einzelnes „?“ als Dank behandelte, ist in Cura und AnimaLine mit Regressionstest behoben.

## Messmethode und Zwischenläufe

Der endgültige Code ist `119040f`. Pro Wissensmodus laufen zwei Fälle parallel; die Modi liefen zeitweise gleichzeitig auf dem EU-Server. Zeiten umfassen lokale Embeddings, reale Indexsuche und Modell/Prüfer. Aktenkontext kommt aus dem eingefrorenen Prüfbestand: **keine vollständige Production-HTTP-Laufzeitmessung**. Der gesamte Prüfchat wird aus dem Archiv-Retrieval ausgeschlossen; die zusätzlichen 100 Fälle stammen aus anderen Chats. Nur Patientenaussagen der letzten sieben Tage werden als Gesprächstatsachen verwendet.

Der Anliegen-Nenner wurde anhand der Nachricht vor der Ergebnisbewertung festgelegt. Reaktionen, Leertexte, Abschlüsse und Nicht-Patienten werden getrennt gezählt. Eine leere Antwort oder `substantive=false` zählt als fehlend. `substantive` ist eine Modell-Selbsteinschätzung, keine unabhängige Praxisfreigabe. Die genannten Einzelbefunde ergänzen diese Mindestkennzahl.

Ein früherer Codezustand absolvierte 239 Fälle ohne technische Fehler bei 2,90 Sekunden Median, hatte aber acht Zurückhaltungen und zahlreiche unnötige Antworten auf Abschlüsse. Er ist nicht die Abnahme des endgültigen Codes. Ein späterer Versuch scheiterte am 3-Dollar-Limit des alten Testschlüssels (HTTP 402); schnelle Budgetfehler wurden nicht als Laufzeiterfolg gezählt. Der letzte Versuch nutzte einen separaten Testschlüssel mit höchstens 2 Dollar ohne Erneuerung. Ein Vergleich an 20 schwierigen Fällen begründete `reasoning:low` beim Formulieren (Median 7,34 Sekunden), während der Prüfer `none` nutzt.

## Prüfung und Bereitstellung

- Cura: 104 Tests bestanden; Build bestanden; 73 RPC-Berechtigungsprüfungen ohne Verstoß. Code nach `origin/main` gepusht (`fcfdf3a`, `119040f`).
- Migration 105 eingespielt und unverändert: `d734bcfb24fb87a42dc3e9c59186909158426d54181197ccec61b2278da8ef8e`. Mandantentrennung, Entwurfsfilter und Zugriffsschutz geprüft.
- AnimaLine: 56 Tests und Build bestanden; a33095e/befeca4 gepusht und Runtime bereitgestellt. Zwei Neustarts mit jeweils rund 3 Sekunden bis zur WhatsApp-Verbindung, keine Neukopplung. Verbindung anschließend aktiv.
- Leitstand: 679e28f gepusht und bereitgestellt; 303 Tests und Build bestanden. Keine sichtbare Oberfläche geändert.
- Beide neuen Produktionsschalter bleiben aus. Sämtliche Probeläufe ohne WhatsApp-Versand und ohne Fall-, Entscheidungs- oder Benachrichtigungsschreibvorgänge.

## Genannte Live-Fälle: neuer Antworttext

Texte sind anonymisiert; Platzhalter können auch gleichlautende gewöhnliche Wörter überdecken. Datums-/Zeitangaben wurden zusätzlich entfernt. Alle nachfolgenden Texte sind Simulationen ohne Versand. Der ursprüngliche Vorher-Bericht steht in `2026-11-23-probelauf-live-faelle.md`; die Messwerte ordnen denselben L-Schlüsseln den Status von 0365400 zu.

### L24

**Nur freigegeben:** Verstanden, dann machen wir es wie gewohnt. Ich gebe Ihren Wunsch nach einem zeitnahen Termin direkt an das Praxisteam weiter, Rückmeldung am Montag, [Datum/Zeit]. Falls es akut ist, erreichen Sie die [Person] unter [Telefon]. (`retrieval:answered`).

**Mit Entwurfswissen:** Verstanden, dann vereinbaren wir den Termin direkt. Ich gebe Ihren Wunsch nach einem zeitnahen Termin an das Praxisteam weiter, Rückmeldung am Montag, [Datum/Zeit]. Falls es akut ist, erreichen Sie die [Person] unter [Telefon]. (`retrieval:answered`).

### L14

**Nur freigegeben:** Das tut mir leid, dass Ihnen bisher nicht richtig geholfen wurde. Ich gebe Ihre Rückmeldung an das Team weiter, rueckmeldezeit: am Montag, [Datum/Zeit]. Damit das Team gezielt helfen kann: Was genau fehlt Ihnen gerade? (`retrieval:answered`).

**Mit Entwurfswissen:** Das tut mir leid, dass Sie sich bisher nicht ausreichend unterstützt fühlen. Ich habe Ihre offenen Anliegen dem Praxisteam weitergegeben: die Verschiebung des Termins Ihres Kindes auf die kommende Woche ab [Datum/Zeit] ab [Datum/Zeit] und die Rechnung, die sich nicht abrufen lässt. Das Team meldet sich am Montag, [Datum/Zeit]. (`retrieval:answered`).

### L22

**Nur freigegeben:** Vielen Dank für Ihre Nachricht. Ich gebe Ihre Anfrage zur Uhrzeit für den Termin an das Praxisteam weiter, damit eine Zeit für Sie festgelegt wird. Unser Team meldet sich am Montag, [Datum/Zeit], bei Ihnen. (`retrieval:answered`).

**Mit Entwurfswissen:** Danke für den Hinweis, dass noch keine Uhrzeit vereinbart ist. Ich gebe Ihre Bitte um eine Terminabsprache direkt an das Praxisteam weiter. Unser Team meldet sich am Montag, [Datum/Zeit], bei Ihnen. Für welchen Patienten ist der Termin? (`retrieval:answered`).

### L26

**Nur freigegeben:** Guten Morgen, das ist ärgerlich, dass wieder ein Draht abgebrochen ist. Bitte heben Sie den Draht auf und bringen Sie ihn mit. Ihren Wunsch nach einem Termin am Donnerstagnachmittag für [Person] gebe ich direkt an das Praxisteam weiter, Rückmeldung heute noch. Falls [Person] Schmerzen hat oder etwas drückt oder sticht, rufen Sie uns bitte direkt an unter [Telefon]. (`retrieval:answered`).

**Mit Entwurfswissen:** Guten Morgen, das ist ärgerlich, dass bei [Person] schon wieder ein Draht abgebrochen ist. Heben Sie das Drahtstück bitte auf und bringen Sie es mit, und decken Sie scharfe Enden bis dahin mit Wachs ab. Ich gebe Ihren Wunsch nach einem Donnerstagnachmittag an das Team weiter, Rückmeldung heute noch. Drückt oder sticht gerade etwas, oder hat [Person] Schmerzen? (`retrieval:answered`).

### L30

**Nur freigegeben:** Guten Morgen, ich gebe Ihre Bitte an das Team weiter, den Novembertermin für [Person] zu löschen, da Sie bereits einen neuen Termin in der App gebucht haben. Ich kann die Löschung selbst nicht bestätigen. Das Team meldet sich heute noch bei Ihnen, sobald der Termin entfernt oder der neue Termin geprüft ist. (`retrieval:answered`).

**Mit Entwurfswissen:** Guten Morgen, ich gebe Ihre Bitte, den Novembertermin für [Person] zu löschen, direkt an das Team weiter. Ihren neuen Termin in der App hat das Team dabei im Blick. Die Löschung ist noch nicht erledigt, die Rückmeldung kommt heute noch. (`retrieval:answered`).

### L32

**Nur freigegeben:** Keine Antwort (`social:acknowledged`).

**Mit Entwurfswissen:** Vielen Dank für die Information, dass Sie bereits einen neuen Termin gebucht haben. Den November-Termin für [Person] gebe ich zum Löschen an das Team weiter. Das Team meldet sich heute noch bei Ihnen, ob der alte Termin entfernt wurde. (`retrieval:answered`).

### L35

**Nur freigegeben:** Das tut mir leid, dass die Spange gebrochen ist und Sie Schmerzen haben. Bitte heben Sie alle Teile auf und bringen Sie sie mit, kleben Sie nichts selbst. Ihren Wunsch nach einem früheren Termin gebe ich dem Praxisteam weiter, Rückmeldung heute noch. Wenn die Schmerzen [Person] werden oder zunehmen, rufen Sie bitte sofort unter [Telefon] an. Für welchen Patienten schreiben Sie? (`retrieval:answered`).

**Mit Entwurfswissen:** Das tut mir leid, dass die Spange gebrochen ist und wehtut. Bitte heben Sie alle Teile auf und bringen Sie sie mit, kleben Sie nichts selbst. Ich gebe Ihren Wunsch nach einem zeitnahen Termin an das Team weiter, Rückmeldung heute noch. Wenn die Schmerzen [Person] werden, rufen Sie bitte sofort an: [Telefon]. Für welchen Patienten schreiben Sie? (`retrieval:answered`).

### L39

**Nur freigegeben:** Das tut mir leid, dass es weh tut. Bitte heben Sie alle Teile auf und bringen Sie sie mit, kleben Sie nichts selbst. Ich gebe Ihren Wunsch nach einem früheren Termin an das Team weiter, Rückmeldung heute noch. Für wen schreiben Sie? Bei akuten oder stärker werdenden Schmerzen rufen Sie bitte an: [Telefon]. (`retrieval:answered`).

**Mit Entwurfswissen:** Das tut mir leid, dass die Spange abgegangen ist und Schmerzen [Person]. Bitte heben Sie alle Teile auf und bringen Sie sie mit, kleben Sie nichts selbst an. Ich habe Ihren Wunsch nach einem früheren Termin an das Team weitergegeben, Rückmeldung heute noch. Für wen schreiben Sie? (`retrieval:answered`).

## Fortsetzung

Offen sind der restliche 239er-Durchlauf in beiden Modi und die Korrektur/erneute Prüfung der oben genannten Befunde. Erst danach ist eine belastbare Abnahme gegen unter 5 % möglich. Nicht bereits abgeschlossene Fälle als bestanden zählen. Kein Produktionsschalter wird ohne Juans Freigabe aktiviert.

Vertrag für Claude: `2026-11-23-retrieval-vertrag.md`. Vollständige Liste der 239 Prüfkennzeichen und ausgeführten Status-/Zeitmessungen: `2026-11-23-retrieval-239-messwerte.json`. Rohdaten und Zuordnung zu Patienten bleiben außerhalb von Git.
