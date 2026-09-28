# Patienten per E-Mail zur App-Einrichtung erreichen

Stand: 28.09.2026, Datenabgleich 13:45 UTC. **Noch keine Rundmail versendet.**

## Ergebnis des vollständigen Abgleichs

„Aktiv“ bedeutet für diese Auswertung: mindestens ein eingereichter Anamnesebogen, unabhängig von Unterschrift oder Übertragungsstatus. Nicht der allgemeine Aktiv-Schalter der Patientenverwaltung.

| Prüfung | Ergebnis |
| --- | ---: |
| Einreichungen insgesamt | 407 |
| Verknüpfte Patientenakten | 374 |
| Weitere Einreichungen zu denselben Akten | 33 |
| Patientenakten mit ausgefülltem E-Mail-Feld | 374 |
| Patientenakten mit syntaktisch plausibler, nicht verdächtiger Kontaktadresse | 371 |
| Unterschiedliche plausible Kontaktadressen | 348 |
| Davon von mehreren Patientenakten gemeinsam genutzt | 23 |
| Kontaktadressen mit Mailserver-DNS-Eintrag | 348 |
| Aktuelle fehlerhafte oder verdächtige Adressen | 3 |
| Kontaktadressen ohne zusätzliche Identitäts-/Kontozuordnungs-Prüffälle | 291 |
| Dadurch abgedeckte Patientenakten | 307 |

Die drei auffälligen Adressen werden nicht geraten oder stillschweigend korrigiert. Bei zwei dieser Akten sind alternative Adressen vorhanden; deren Verwendung muss geprüft werden. Frühere fehlerhafte Adressen werden nicht verwendet, wenn eine neuere Einreichung eine andere Adresse enthält.

DNS bestätigt nur eine Mailserver-Konfiguration, weder die Existenz des einzelnen Postfachs noch die Zustellung oder die berechtigte Inhaberschaft. Patientenakten wurden nicht allein wegen Namensähnlichkeit zusammengeführt.

### Zugang und Einwilligung

- Bei 122 Patientenakten ist an dem eindeutig gefundenen Portal-Konto mindestens eine Anmeldung protokolliert. Bei 252 wurde über diesen Abgleich keine Anmeldung festgestellt; bei mehreren/fehlenden Konten ist das keine Aussage über sämtliche möglicherweise vorhandenen Zugänge.
- Eine Anmeldung ist kein Installationsnachweis und kein Beleg, dass das aktuelle Passwort bekannt ist.
- Unter den 348 Adressen haben 57 zusätzliche Prüfpunkte. Pro Adresse können mehrere zutreffen: Identitätsabweichungen (27), Konto-/Metadatenabweichungen (18), kein verknüpftes Portal-Profil (9), mehrere Profile (5). Dies sind Prüfhinweise, nicht 57 nachgewiesene Login-Ausfälle.
- Aktuellste explizit gespeicherte Entscheidung zum digitalen Rechnungsempfang: 276 Akten mit Zustimmung, 27 mit Ablehnung, 71 ohne eindeutige Entscheidung. Neuere Ablehnungen überschreiben ältere Zustimmungen; fehlende Werte werden nicht als Zustimmung gewertet.
- Unter den 291 technisch vorbereiteten Empfängeradressen: 216 nur mit zustimmenden Akten, 24 mit mindestens einer ablehnenden Akte, 51 ohne durchgängig bestätigte Zustimmung. Familienadressen erhalten nicht mehrere identische Rundmails.

## Was bereits erledigt ist

1. Alle Einreichungen, zugehörige Patientenstammdaten, Konto-Zuordnungen, Anmeldedaten und Einwilligungen rein lesend abgeglichen; keine medizinischen Antworten oder Passwörter exportiert.
2. Kontaktadressen von generierten App-Benutzernamen getrennt.
3. Wiederholte Einreichungen und gemeinsam genutzte Kontaktadressen berücksichtigt.
4. Private Empfänger-/Prüfliste erstellt. Sie liegt ausschließlich lokal, mit Dateirechten `0600`, und wird durch `.gitignore` vom Repository ausgeschlossen.
5. Wiederholbares Prüfskript und Regressionstests hinzugefügt. Standard und `--write-private` versenden nichts und verändern keine Produktivdaten.

Ausführung:

```sh
npm run audit:patient-outreach
npm run audit:patient-outreach -- --write-private
npm run test:patient-outreach
```

Private Liste dieses Abgleichs: `output/patient-outreach-2026-09-28T13-45-55-654Z.private.json`. Enthält Kontaktadressen, Quellen/Patientenreferenzen, Prüfpunkte und Einwilligungssegmente, aber keine Zugangspasswörter. Nicht in öffentliche Tickets oder Notion-Seiten kopieren.

## Versandstatus und noch nötige Schritte

**Dies ist ein geprüfter Adressbestand mit Textentwurf, noch kein implementierter oder laufender Rundmail-Versand.**

1. Inhalt und Empfängerkreis freigeben: Einrichtung jetzt vorbereiten, keine behauptete App-Pflicht und keine Behauptung, dass die IVORIS-Rechnungen bereits verfügbar sind.
2. Bei den Prüffällen Identität/Kontozuordnung und die drei auffälligen Adressen klären. Keine Konten automatisch löschen, zusammenführen oder Passwörter zurücksetzen.
3. Zustellweg verifizieren: Der Produktionshost listet Absender und Mail-API-Schlüssel als geschützte Variablen (`sensitive`). Ihr Wert ist über die Verwaltungs-API bzw. den Export nicht lesbar. Leere Exportwerte beweisen daher **keine** fehlende Produktionskonfiguration. Lokal fehlen die Mail-Zugangsdaten. Ein realer Versand-/Zustelltest wurde nicht vorgenommen; die durchsuchten Produktionslogs lieferten keine passenden Einträge.
4. Ein konkretes Testpostfach, einen antwortfähigen Praxis-Absender bzw. Reply-To und die Zugangsanleitung testen. Der Login bietet derzeit keine selbst bedienbare Passwort-vergessen-Funktion. Nicht einfach einen solchen Link versprechen. Persönliche Welcome-Seiten wurden nicht besucht: Sie können Zugangsdaten anzeigen und bei fehlenden Zugangsdaten Konten verändern.
5. Danach kontrollierten Einzelversand einrichten: eine Nachricht pro Kontaktadresse/Kampagne, dauerhaft protokollierter Versandstatus, Schutz vor Doppelversand, Fehler-/Bounce-Liste. „Vom Anbieter angenommen“ nicht als „zugestellt“ ausgeben. Keine offene CC-Liste, keine Passwörter, Rechnungsbeträge oder medizinischen Inhalte in der Rundmail.

## Textentwurf für Empfänger mit dokumentierter Zustimmung

**Betreff: Wichtig: Bitte Ihren Anima-Cura-Zugang jetzt einrichten**

Liebe Patientinnen und Patienten, liebe Eltern,

Sie haben dem digitalen Rechnungsempfang zugestimmt. Wir bereiten die Bereitstellung Ihrer Rechnungen in Anima Cura vor. Bitte prüfen Sie deshalb jetzt Ihren Zugang, damit Sie Ihre Rechnungen später einsehen und herunterladen können.

**Bitte öffnen Sie https://animacura.io/patient/login und melden Sie sich mit Ihren vorhandenen Zugangsdaten an.**

Speichern Sie Anima Cura anschließend auf dem Startbildschirm Ihres Smartphones, damit Sie die App schnell wiederfinden. Der Zugang ist auch direkt im Browser möglich.

Wichtig: Den Anamnesebogen müssen Sie dafür **nicht erneut ausfüllen**. Falls Ihnen die Zugangsdaten fehlen oder die Anmeldung nicht funktioniert, antworten Sie bitte auf diese E-Mail. Bitte senden Sie uns keine Passwörter.

Diese Nachricht dient der Vorbereitung und bedeutet noch nicht, dass bereits eine neue Rechnung für Sie hinterlegt wurde.

Vielen Dank für Ihre Unterstützung!

Ihre KFO-Praxis Dr. Schubert

### Bei fehlender oder abgelehnter Zustimmung

Die Aussage „Sie haben zugestimmt“ darf nicht versendet werden. Keine Umstellung auf ausschließliche App-Rechnungen und keine Pflichtbehauptung. Ein separater rein organisatorischer Informationstext und dessen Empfängerkreis müssen abgestimmt werden; eine Ablehnung wird nicht durch eine Rundmail aufgehoben.

## Warum keine pauschale Installationspflicht behauptet wird

Im aktuellen Anamnesebogen ist `ew_digitale_rechnung` ausdrücklich freiwillig: „Freiwillig: Verzicht auf Papierrechnungen, Zustimmung zu digitalen Rechnungen.“ Eine Einreichung allein ist deshalb keine Zustimmung. Zusätzlich sieht § 14 Abs. 1 UStG für elektronische Rechnungsübermittlung grundsätzlich die Zustimmung des Empfängers vor; die dortige Ausnahme begründet keine allgemeine App-Installationspflicht für Patienten. [Gesetzestext](https://www.gesetze-im-internet.de/ustg_1980/__14.html)

Eine dringliche Bitte um Einrichtung ist möglich. Eine erfundene Pflicht, angebliche Sanktionen oder die unbestätigte Behauptung „Ihre Rechnung liegt bereits in der App“ sind nicht Grundlage dieses Versands.
