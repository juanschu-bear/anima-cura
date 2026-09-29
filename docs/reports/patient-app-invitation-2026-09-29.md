# App-Einladung – 29. September 2026

## Umfang und tatsächlicher Stand

- Einmalige Bestands-Einladung, unabhängig von der bereits bestehenden 24-Stunden-Erinnerung.
- 300 geprüfte Kontaktadressen, zugeordnet zu 317 Patientenakten (Live-Abgleich vor Versand). 58 weitere Adressen wegen Identitäts-/Kontoverknüpfungsproblemen zurückgestellt.
- Mehr als 700 aktive, kontaktierbare Patienten sind durch den Anamnesebestand bislang nicht belegt. Keine ungeprüfte Erweiterung auf sämtliche historischen Praxisakten.
- Ein persönlicher Text bei eindeutiger Zuordnung, neutraler Text bei gemeinsam genutzten Familienadressen. Keine Passwörter, Zahlungsbeträge oder Dokumente in der Einladung.
- Einladung fordert zur heutigen Anmeldung auf, erklärt abweichende Login-Adressen und Browser-/Home-Bildschirm-Nutzung. Sie behauptet ausdrücklich nicht, dass Rechnungen bereits bereitliegen.

## Versandabsicherung

- Berechtigte Praxisadministration startet Vorschau, Test und Versand unter Automatisierungen.
- Empfängerliste wird vor Versand unveränderlich in `einstellungen` eingefroren; erneute Identitäts-/Kontoprüfung vor jedem Paket.
- Ein dauerhafter, eindeutiger Versandbeleg pro Kontaktadresse in `workflow_runs`, zusätzlich Idempotenzschlüssel beim Versanddienst.
- Fehler oder unklarer Versandstatus lösen keine automatische Wiederholung aus. Bereits bearbeitete Empfänger werden nicht erneut angeschrieben.
- Anbieterannahme ist keine Zustellbestätigung. Die Oberfläche benennt das ausdrücklich.
- Lauf wird durch die geöffnete Verwaltungsansicht gesteuert. Nach Schließen/Navigation ist ein Fortsetzen dort nötig; kein unsichtbar weiterlaufender Cronjob für diese Kampagne.
- Kampagnen-ID: `e8c5f5ae-2092-4b6b-89c0-f063e512a688`.

## App-Prüfung – Grenzen nicht verschleiern

- Login-Seite und Web-App-Manifest erreichbar. Nicht angemeldete Portalaufrufe führen zum Login; Rechnungs-/Dokumenten-APIs antworten ohne Anmeldung mit 401.
- Code bietet Behandlung, Zahlungen/Raten, Nachrichten, Benachrichtigungen und Dokumente. Das beweist nicht, dass jede Patientenakte vollständige Daten enthält oder jeder Patient sich erfolgreich anmelden kann.
- Rechnungs-API liefert finanzielle Einträge, keine Rechnungs-PDFs. Sie begrenzt auf 20 Einträge; Oberfläche zeigt davon zunächst sechs.
- Der aktuelle Dokumentenbestand enthält 13 Dokumente; nach Typ/Name keine als Rechnung identifizierten Dokumente. IVORIS-Originalrechnungsabruf bleibt offen.
- Die Datenladefunktion im Portal überspringt fehlgeschlagene Einzelanfragen derzeit ohne sichtbaren Fehlerhinweis. Das kann leere Ansichten vortäuschen und muss separat verbessert werden.
- BEMA-/GOZ-/PDS-Unterlagen nach Eingang auf tatsächliche Rechnungsinhalte, Patientenzuordnung und Importmöglichkeit prüfen. Keine Rechnungen aus unvollständigen Salden erfinden.

### Datenabdeckung der 317 angeschriebenen Patientenakten

Direkte Datenbankprüfung der vom Portal genutzten Tabellen, ohne personenbezogene Detailausgabe:

| Quelle | Datensätze | Patientenakten mit Daten |
|---|---:|---:|
| `patient_documents` | 0 | 0 |
| `offene_posten` nach dem Filter der Rechnungs-API | 360 | 114 |
| `behandlungsphasen` | 0 | 0 |
| `ratenplaene` (alle Status) | 100 | 100 |

Das Portal bietet also nicht automatisch die vollständigen IVORIS-Unterlagen. Rechnungsbeträge sind keine Originalrechnungen. Behandlungsdaten an anderer Stelle der Praxissoftware belegen noch keine befüllten Portal-Behandlungsphasen.

## Verifikation

- 87 automatisierte Tests erfolgreich, TypeScript-Prüfung und Produktionsbuild erfolgreich.
- Commit `a3c4f1c` gepusht; Vercel meldete READY.
- Testmail vom Anbieter angenommen am 29.09.2026, 15:55 UTC.
- Rundmail auf ausdrücklichen Nutzerwunsch gestoppt: **159 vom Anbieter angenommen, 141 nicht verschickt**. Keine laufenden Versandbelege beim abschließenden Datenbankcheck.
- Grund: Einladung benötigt einen direkten persönlichen Zugangslink statt Verweis auf eine möglicherweise verlorene erste Bestätigung.
- Überarbeiteter Entwurf mit Zugangsbuttons; Familienkontakte bekommen getrennte Buttons. Kein weiterer Patientenversand ohne neue ausdrückliche Freigabe. Die 159 früheren Empfänger brauchen bei Freigabe eine separat protokollierte Ergänzung, keine unbemerkte Wiederholung.
- Persistentes `paused`-Flag und Inhaltsversionsprüfung sperren den Versand auch serverseitig. Testversand bleibt möglich.
- Welcome-Seite ist jetzt lesend: kein automatisches Erzeugen/Zurücksetzen von Konten beim Linkaufruf. Bereits benutzte Konten zeigen kein möglicherweise veraltetes Startpasswort; keine Aussage, dass das aktuelle Passwort erneut angezeigt werden kann.
