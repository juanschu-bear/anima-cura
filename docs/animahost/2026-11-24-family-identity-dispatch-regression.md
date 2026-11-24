# Familienzuordnung und Versandplanung – 24.11.2026

## Fehler und Änderung

- AnimaLine begrenzte normale Antworten auf 20 Sekunden und Notfälle auf null. Jetzt gelten 30–90 bzw. 10–15 Sekunden ab letztem Eingang, inklusive Erzeugung. Lese-/Schreiblänge und Zufallsstreuung bestimmen die Zielzeit. Tippanzeige in den letzten 3–20 Sekunden, beendet bei Versand oder verworfenem Plan. Bei zu langer Erzeugung sofort senden, Überschreitung dokumentieren.
- Der Namensabgleich behandelte genannte Familienmitglieder als Absender. Verwandtschaftsklauseln bleiben im Modelltext erhalten, werden aber aus der Absendernamenssuche entfernt. Eine Selbstvorstellung wird unabhängig von der bisherigen Telefonnummer-Zuordnung im Stamm geprüft. Ein eindeutiger Vollname löst keine Geschwister-Mehrdeutigkeit mehr aus. Tatsächlich gleichnamige Patienten bleiben mehrdeutig.
- Gesprächszuordnung und Freigabe vertraulicher Akten sind getrennte Angaben im Patientenblatt. Ein bereits mitgeteilter Name bzw. ein Geburtsdatum wird dem Modell als beantwortete Zuordnungsfrage mitgegeben. Erneute Identitätsfragen erhalten einmal einen Korrekturhinweis, sperren aber keinen Versand. Nach Juans aktuellem Auftrag ist nur `confidential_unconfirmed` eine inhaltliche Versandsperre nach dem zweiten Versuch. Medizinische und sonstige Vorgaben bleiben im unveränderten Systemtext und in den Prüferhinweisen; technische Ausfälle/fehlender Text bleiben gesonderte Fehler.
- `plannedSendAt` war in den beiden untersuchten AnimaLine-Ereignissen bereits auf oberster Ebene gespeichert. Jetzt steht es samt `sendReason` zusätzlich in `details` und in `daily_review`. Ein vorher erzeugter Cura-Modellbeleg enthält noch keinen späteren Line-Versandzeitpunkt.

## Nachspiel ohne Versand

Originaleingänge und vorausgehender Verlauf, aktueller Patientenstamm; keine Rekonstruktion eines vollständigen historischen Datenbank-Snapshots. Alle drei Eingänge erzeugten eine Antwort ohne `chain:guard_rejected`. Die eindeutige Selbstvorstellung traf genau einen Patienten. Der erwähnte Bruder wurde nicht als Absender gewählt. Vertrauliche Akten blieben gesperrt. Originaltexte und Antworten stehen ausschließlich im privaten Bericht, nicht im Repository.

| Fall | Eingang UTC | geplante Zeit UTC | Abstand | Ergebnis |
|---|---|---|---|---|
| Vollmacht für Bruder | 14:01:07 | 14:02:23 | 76 s | Antwort, kein Wechsel zum Bruder |
| Selbstvorstellung | 15:29:05 | 15:30:20 | 75 s | eindeutiger Name; Entwurf durch nächsten Eingang verworfen |
| Geburtsdatum | 15:29:52 | 15:31:05 | 73 s | gemeinsame Antwort auf beide offenen Nachrichten |

Die Texte sind Modelloutputs, keine fest hinterlegten Antworten. Der zweite Entwurf fragt nach einem widersprüchlichen Pronomen im Originaleingang, nicht nach dem Geburtsdatum; er würde wegen der Folgemitteilung ohnehin nicht versendet. Kein Probelauf hat Nachrichten verschickt oder Patientenzuordnungen verändert.

## Prüfung

134 AnimaHost-Tests bestanden; 74 RPC-Aufrufstellen ohne Berechtigungsverstoß. 72 AnimaLine-Tests bestanden, einschließlich Dauerhaftigkeit, Ersetzen offener Pläne, keine Doppelzustellung nach Neustart, Notfall-/Normalfristen und identischem Plan in Detail-/Versandbeleg. Beide Builds vor dem Commit erfolgreich.

Zusätzlicher Einzeltest des Geburtsdatums: Antwort ohne erneute Namens-/Geburtsdatumsfrage und ohne Versandstopp, geplant 15:30:37 UTC (45 Sekunden). Ursache war neben dem blockierenden Prüfer auch die Übergabe als bloßer `[Datum]`-Platzhalter. Der Entwurf erhält nun die strukturierte Bedeutung „Antwort auf die Geburtsdatumsfrage; mitgeteilt und ausgewertet“, ohne den Wert erneut offenzulegen.
