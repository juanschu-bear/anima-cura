# IVORIS-Rechnungen: Postbuch und REST-Abruf

Stand: 25.09.2026. Ziel ist die automatische Übernahme fertiger IVORIS-Rechnungen in Anima Cura. Die Praxis soll ihre Rechnungen in IVORIS bearbeiten; einzelne Exporte und Uploads in Anima Cura sind nicht der vereinbarte Arbeitsablauf.

## Ergebnis

Der dokumentierte Ablageort ist das **Postbuch des Patienten**. IVORIS kann ausgewählte Dokumente, einschließlich Rechnungsformularen, beim Drucken automatisch dort ablegen. Die Einstellung lautet:

**Einstellungen → Allgemein → Postbuch → Erzeugen von Postbucheinträgen**

Das belegt die [offizielle IVORIS-Einführung, Seite 169](https://www.ivoris.de/Doku/Anleitungen/Einfuehrung_ivoris.pdf#page=169). Auf Seiten 170–171 wird auch der Import bestehender Dateien direkt in das Patienten-Postbuch beschrieben. Für den regulären Rechnungsablauf ist die automatische Ablage beim Druck zu prüfen.

**Der Abruf einer echten Rechnung aus dieser Praxis ist noch nicht nachgewiesen.** Ein vorhandenes Anamnese-PDF lässt sich dagegen über die REST-API abrufen. Der bislang verwendete Listentest reicht nicht aus, um das Vorhandensein von Dokumenten in IVORIS auszuschließen.

## Live-Nachweise

Die folgenden Prüfungen waren ausschließlich lesend. Es wurden keine Rechnungen erzeugt, verschoben oder versendet und keine Patientenakten verändert. Der korrekte Mandant wurde über `GET /Profile/v1/Profiles` geprüft. Patientenidentitäten und Zugangsdaten werden nicht in diesem Bericht veröffentlicht.

| Fall | Abfrage | Ergebnis |
| --- | --- | --- |
| Rechnungsfall A | `DocumentEntries`, ohne Datumsfilter | HTTP 200, leere Liste |
| Rechnungsfall A | `Entries`, ohne Datumsfilter | HTTP 200, 19 Texte, keine `DocumentId` |
| Rechnungsfall B | `DocumentEntries`, ohne Datumsfilter | HTTP 200, leere Liste |
| Rechnungsfall B | `Entries`, ohne Datumsfilter | HTTP 200, 78 Texte, keine `DocumentId` |
| Rechnungsfall C | `DocumentEntries`, ohne Datumsfilter | HTTP 200, leere Liste |
| Rechnungsfall C | `Entries`, ohne Datumsfilter | HTTP 200, 3 Texte, keine `DocumentId` |
| Bekanntes Anamnese-Dokument | `Document?documentId=…` | HTTP 200, 560.745 decodierte Bytes, PDF-Dateisignatur |
| Derselbe Kontrollpatient | `DocumentEntries` und `Entries`, 01.01.–25.09.2026 sowie ohne Datumsfilter | jeweils HTTP 200, leere Liste |

Beim Kontroll-Dokument stimmen der zurückgegebene `PatientId` und `ProfileId` mit den für die Listenabfrage verwendeten Werten überein. Sein Datum liegt innerhalb des geprüften Zeitraums. Ein bloß falscher Datumsfilter oder Mandant erklärt dieses Gegenbeispiel damit nicht.

Die Texte der Rechnungsfälle enthalten Hinweise auf Rechnungen beziehungsweise Zahlungen. Das ist kein Nachweis für eine abrufbare Rechnungsdatei.

## Aussage der vorhandenen REST-Dokumentation

Die zur Prüfung über Anima Cura geladene Hersteller-OpenAPI beschreibt:

- `GET /Documentation/v1/DocumentEntries`: Einträge für `patientId` und `profileId`; `begin` und `end` sind optional.
- `GET /Documentation/v1/Entries`: Einträge desselben Patienten und Mandanten, optional nach `entryType` und Datum gefiltert.
- `GET /Documentation/v1/Document`: Dateiabruf über eine bereits bekannte `documentId`.
- `POST /Documentation/v1/Document`: Dokument in der Patientendokumentation anlegen.
- `POST /Documentation/v1/Entry`: Dokumentationseintrag anlegen. Das Feld `DocumentId` wird laut Schema beim Schreiben ignoriert. Eine fehlende Verknüpfung lässt sich deshalb nicht einfach durch Setzen dieses Feldes herstellen.

In dieser Spezifikation ist kein separater Rechnungsendpunkt und kein weiterer Endpunkt zur vollständigen Auflistung aller Patientendateien dokumentiert. Das widerlegt nicht die Abrufbarkeit von Rechnungsdateien über die allgemeine Dokumentenschnittstelle.

Aus `DocumentEntries = []` folgt nur: **Diese Abfrage hat keine Einträge geliefert.** Daraus folgt weder, dass im Postbuch keine Rechnung liegt, noch dass ein manueller Upload in Anima Cura notwendig wäre. Warum die Listenabfrage auch das bekannte Dokument nicht liefert, ist noch nicht geklärt. Eine absichtliche Filterung, eine fehlende Verknüpfung oder ein Fehler sind ohne weitere Evidenz keine festgestellte Ursache.

## Konkreter Gegencheck in der Praxis

1. Einen der bereits geprüften Patienten in IVORIS öffnen, zum **Postbuch** wechseln und eine bereits bestehende Rechnung öffnen. Rechnungsdatum, Dokumenttitel und Patientenzuordnung festhalten. Zunächst genügt diese Bestandsprüfung; keine neue Rechnung erzeugen.
2. Falls die Rechnung dort fehlt, die Zuordnung der betreffenden Rechnungsformulare unter **Einstellungen → Allgemein → Postbuch → Erzeugen von Postbucheinträgen** prüfen. Eine fehlende Ablage ist bisher nicht bewiesen.
3. Die API für exakt diesen Patienten und Mandanten erneut lesen. Den Eintrag und seine `DocumentId` mit der geöffneten Rechnung abgleichen; die Datei anschließend über `GetDocument` abrufen.
4. Liefert die API trotz sichtbarer Rechnung keine Verknüpfung, Computer konkret den konkreten Fall vorlegen: Welche Postbuch-Einträge muss `DocumentEntries` zurückgeben, welche Konfiguration oder Berechtigung ist erforderlich, und wie wird die ID dieser Rechnung über REST ermittelt? Der bekannte abrufbare, aber nicht gelistete Kontrollbeleg gehört zu dieser technischen Rückfrage.

Die Postbuch-Einstellungen und die sichtbare Rechnungsablage sind über die vorliegende API nicht einsehbar. Für diesen Teil wird die IVORIS-Oberfläche der Praxis benötigt. Die REST-Prüfung lässt sich anschließend durch uns ausführen; Sabine muss keine API bedienen.

## Nachweis für die anschließende Automatisierung

Der Ablauf gilt erst dann als bestätigt, wenn eine echte, in IVORIS sichtbare Rechnung über die dokumentierte Schnittstelle gefunden und als Datei abgerufen wurde und Patient, Rechnungsnummer, Datum und Betrag mit dem Original übereinstimmen. Erst darauf aufbauend folgen automatische Übernahme, Dublettenprüfung, Anzeige in der Patienten-App und Benachrichtigung.

Dieser Bericht dokumentiert den Befund und den fehlenden Nachweis. Er behauptet keine bereits funktionierende Rechnungsverteilung.
