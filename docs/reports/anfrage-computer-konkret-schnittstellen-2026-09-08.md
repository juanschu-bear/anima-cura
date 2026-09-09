# Versandfertige technische Anfrage an Computer konkret

**Betreff:** Verbindliche technische Klärung ivoris-Webservice – Patientendaten, Vertreter/Versicherte und Abrechnungspositionen

Guten Tag,

wir betreiben für unsere kieferorthopädische Praxis eine eigene, ergänzende Anwendung und nutzen dafür den ivoris-Webservice. Damit wir Daten ausschließlich über herstellerunterstützte Wege übertragen und anschließend technisch verifizieren, benötigen wir für unsere konkrete Praxislizenz und Partnerkennung eine verbindliche technische Auskunft.

Bitte beantworten Sie die folgenden Punkte jeweils mit Endpunkt, HTTP-Methode, Request-/Response-Modell, notwendigen Modulen/Freischaltungen und – soweit möglich – OpenAPI-Auszug oder Beispielpayload. Eine allgemeine Aussage, dass eine Schnittstelle vorhanden ist, reicht für eine sichere Implementierung nicht aus.

## 1. Patient und Kontaktfelder

1. Welche Operation ist für die Anlage und Aktualisierung eines Patienten freigegeben?
2. Welche Felder werden für E-Mail, Telefon, Mobilnummer, Straße, Hausnummer, Postleitzahl und Ort unterstützt?
3. Über welche Operation können diese Werte unmittelbar nach dem Schreiben vollständig zurückgelesen werden?
4. Gibt es ein unterstütztes Zielfeld für Anrede/Geschlecht und welche zulässigen Werte gelten?
5. Wie werden gesetzlicher Vertreter beziehungsweise sorgeberechtigte oder versicherte Person mit Name, Anschrift, Telefon und E-Mail angelegt, aktualisiert und eindeutig mit dem Patienten verknüpft?
6. Wie werden Versicherungsart, Krankenkasse und Versichertennummer geschrieben und zurückgelesen?

## 2. Dokumente und Karteieinträge

1. Ist `POST /Document/v1/AddDocument` für unseren Zugang der freigegebene Dokumentkanal?
2. Welche Operation liefert nach dem Schreiben die stabile Dokument-ID und erlaubt eine eindeutige Rückleseprüfung?
3. Ist `POST /Documentation/v1/Entry` der freigegebene append-only Kanal für Karteieinträge?
4. Welche Herstellerempfehlung verhindert Doppelanlagen nach Timeout oder HTTP 502/503/504: externer Idempotenzschlüssel, Partnerreferenz oder fachliche Vorab-/Nachsuche?
5. Bitte erläutern Sie die aktuelle Bedeutung wiederholter leerer HTTP-503-Antworten über Patienten-, Dokument- und Dokumentationsendpunkte hinweg sowie die vorgesehenen Eskalations- und Verfügbarkeitswege.

## 3. Abrechnungspositionen

1. Welches lizenzierte Modul und welcher Partnerzugang erlauben das Lesen und Schreiben einzelner KFO-BEMA-, GOZ- und gegebenenfalls GOÄ-Positionen?
2. Welche Operationen unterstützen das Lesen vorhandener Leistungen eines Patienten/Falls/Abrechnungszeitraums, das Schreiben neuer Positionen und die Rückleseverifikation mit stabiler ID?
3. Wie werden Anzahl, Zahn/Region, Leistungsdatum, Behandler, Begründung, Behandlungsfall, Kassen-/Privatfall, Quartal, Abschlagsnummer und KZV-Kontext übertragen?
4. Wie können bereits abgerechnete oder vorgemerkte Positionen vorab erkannt werden, damit insbesondere 01K, 119/120 und quartalsbezogene Abschläge nicht doppelt angesetzt werden?
5. Welche Idempotenzmöglichkeit unterstützt ivoris für diesen Schreibweg?
6. Falls der Webservice keine einzelnen Abrechnungspositionen schreiben darf: Welcher offiziell unterstützte Importkanal übernimmt bestätigte Positionen einschließlich eines technisch prüfbaren Annahmebelegs?

## 4. Test und Produktivfreigabe

Bitte stellen Sie uns einen Testmandanten beziehungsweise freigegebenen Testpatienten sowie die zugehörige technische Dokumentation zur Verfügung. Außerdem benötigen wir eine schriftliche Bestätigung, welche der genannten Operationen in unserer produktiven Praxis supportfähig eingesetzt werden dürfen.

Bis zu dieser Bestätigung behandeln wir nicht rücklesbar verifizierte Felder und Abrechnungspositionen ausdrücklich nicht als erfolgreich nach ivoris übertragen.

Vielen Dank.
