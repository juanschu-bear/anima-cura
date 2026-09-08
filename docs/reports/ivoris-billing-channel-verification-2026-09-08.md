# IVORIS-Abrechnungskanal – technischer Prüfstand 08.09.2026

## Ergebnis

Die öffentliche Herstellerinformation bestätigt, dass `ivoris webservice` externe Anwendungen, Factoring und KI-Abrechnung grundsätzlich anbinden kann. Sie veröffentlicht jedoch keine technische Operation, mit der eine Partneranwendung einzelne KFO-BEMA-/GOZ-Positionen patienten- und fallbezogen lesen, schreiben und anschließend verifizieren kann.

Die für Anima Cura aktivierte Schnittstelle enthält nach dem aktuellen technischen Bestand Patienten-, Dokumentations- und Dokumentfunktionen, aber keinen belegten Abrechnungsendpunkt. Deshalb bleibt ein automatischer Abrechnungspush gesperrt. Der in Anima Scribe angebotene Export ist ausdrücklich nur eine manuelle Zwischenlösung.

## Öffentliche Herstellerbelege

- [ivoris Module & Schnittstellen](https://www.ivoris.de/module-schnittstellen/): Der Hersteller beschreibt den Webservice allgemein als Verbindung zu Online-Diensten und Abrechnung.
- [ivoris webservice](https://www.ivoris.de/module-schnittstellen/ivoris-webservice/): Genannt werden Factoring-Integration und Partner für „Smarte Dokumentation & Befundung, KI-Abrechnung“, jedoch keine API-Operationen oder Datenmodelle.
- [Systemvoraussetzungen und Schnittstellen](https://www.ivoris.ch/Doku/Installation_Kopplungen/Systemvoraussetzungen.pdf): Beschrieben sind unter anderem AzP-, VDDS- und ABZ-Schnittstellen. Daraus folgt nicht, dass einzelne Leistungspositionen über den vorhandenen Webservice geschrieben werden dürfen.

## Verbindlich an Computer konkret zu beantwortende Fragen

Bitte nicht nur mit „ivoris besitzt eine Schnittstelle“ beantworten, sondern für die konkrete Praxislizenz und Partnerkennung technisch bestätigen:

1. Welches lizenzierte Modul und welcher freizuschaltende Partnerzugang erlauben Anima Cura das Lesen und Schreiben einzelner KFO-Abrechnungspositionen?
2. Gibt es REST-/Webservice-Operationen für:
   - vorhandene Leistungen eines Patienten/Falls und Abrechnungszeitraums lesen,
   - neue BEMA-/GOZ-/GOÄ-Positionen schreiben,
   - Anzahl, Zahn/Region, Datum, Behandler und Begründung übertragen,
   - den gespeicherten Datensatz mit stabiler ID zurücklesen?
3. Wie werden Behandlungsfall, Kassen-/Privatfall, Quartal, Abschlagsnummer und KZV-Kontext eindeutig adressiert?
4. Welche Idempotenzmöglichkeit unterstützt IVORIS: externer Schlüssel, Partnerreferenz oder vorab prüfbare eindeutige Referenz?
5. Welche Operation liefert bereits abgerechnete beziehungsweise vorgemerkte Positionen, damit 01K, 119/120 und quartalsbezogene Abschläge nicht doppelt angesetzt werden?
6. Sind Schreiboperationen für produktive Abrechnung vom Hersteller freigegeben und supportfähig? Bitte Endpunktbeschreibung/OpenAPI, Beispielpayloads, Fehlercodes und Testmandant bereitstellen.
7. Falls der Webservice dies nicht unterstützt: Welcher offiziell unterstützte Importkanal kann einzelne bestätigte Positionen inklusive Rücklesebeleg übernehmen?

## Freigabekriterium für die Implementierung

Der Billing-Adapter wird erst aktiviert, wenn mindestens `readBilledPositions`, `writePositions` und `verifyWrittenPositions` mit einem IVORIS-Testpatienten nachweisbar funktionieren und Computer konkret den Kanal für die produktive Nutzung schriftlich bestätigt. Bis dahin darf kein UI-Status „nach IVORIS übertragen“ für Abrechnungspositionen erscheinen.
