# AnimaHost · Abnahme mit Regelbuch 10

Lauf `retrieval-v10-4ecc3209-e96b-4cc4-8b66-f274376db1f9` · 2026-11-24T08:30:09.130Z. Antwortlogik `cdf967a`, zwei Wissensstände, je 239 archivierte Eingänge. Die Ausführung erlaubt bis zu 60 Sekunden pro Fall für die Wiederholung vorübergehender Provider-Fehler. Im Live-Betrieb gilt das eigene Zeitfenster. Kein Versand. Nach der letzten Änderung wurden die von der neuen Prüfung betroffenen Eingänge erneut gerechnet. Der Bericht enthält je Fall das letzte Ergebnis.

**Abnahme offen.** Technische Fehler 8. Antworten mit alten Mustern 240.

| Status | Entwurf | Freigegeben |
| --- | ---: | ---: |
| billing:portal_browser | 3 | 3 |
| billing:portal_missing | 3 | 3 |
| conversation:clarify_first | 9 | 9 |
| conversation:practice_reply | 31 | 29 |
| conversation:unreadable_language | 4 | 4 |
| draht-sticht-oder-etwas-tut-weh | 1 | 1 |
| retrieval:answered | 117 | 124 |
| retrieval:safe_fallback | 32 | 24 |
| sender:non_patient | 2 | 2 |
| sender:team | 3 | 3 |
| social:acknowledged | 26 | 29 |
| social:reaction | 2 | 2 |
| social:unreadable | 2 | 2 |
| technical_error | 4 | 4 |

Median der Erzeugungszeit nur für vorhandene Antworttexte, ohne Versandzeit oder unbeantwortete Fälle.

- `draft_preview` · 7101 ms bei 173 Antworten. 121 Antworten mit mindestens einem Muster. 0 unbeantwortete Fälle außerhalb der vorgesehenen Ausnahmen und 66 bewusst stille Eingänge. Identitätsfragen bei bekannten Patienten 0 unter 143 ausgewerteten bekannten Fällen.
- `approved` · 7106.5 ms bei 172 Antworten. 119 Antworten mit mindestens einem Muster. 0 unbeantwortete Fälle außerhalb der vorgesehenen Ausnahmen und 67 bewusst stille Eingänge. Identitätsfragen bei bekannten Patienten 0 unter 143 ausgewerteten bekannten Fällen.

Die gesamte Erzeugungszeit einschließlich Übersetzung, Patientenblatt und Quellensuche lag im Median bei 8,24 s mit Entwurfswissen und 8,16 s mit freigegebenem Wissen. In den acht technischen Fehlerfällen entstand dennoch eine sichere Antwort.

## Fremdsprachige Eingänge

Vier erfundene Nachrichten je Sprache. Jede vierte Nachricht enthält eingefügten Übersetzertext.

| Wissensstand | Antworten | Richtige Sprache | Technische Fehler | Sichere Ersatzantworten |
| --- | ---: | ---: | ---: | ---: |
| draft_preview | 20 | 20 | 0 | 3 |
| approved | 20 | 20 | 0 | 5 |

## Zwei offene Praxisfälle

- **07:50 Uhr · `f75607c7-a478-4d1a-a2f4-b10053643166`**. Der Versand ist belegt. Die Telefonnummer war zugeordnet, die Identität noch unbestätigt. Die Doctolib-Bestätigung war nicht prüfbar. Die Rezeption muss die Buchung abgleichen.
- **08:16 Uhr · letzter Eingang `62cf9186-c0cd-4623-acca-fc617b20039e`**. Zwei Entwürfe wurden durch weitere Nachrichten ersetzt. Der leere, nicht unterstützte Eingang war ein eigener Eintrag. Der letzte Entwurf scheiterte an der Antwortprüfung. Es ging nichts raus. Der Fall bleibt bei der Praxis.

Fünf vorhandene Antwortbelege wurden anhand von Mandant und WhatsApp-ID mit der richtigen Eintrags-ID verknüpft. Zwei davon gehören zu versendeten Antworten. Beim leeren Eingang fehlt ein historischer Antwortbeleg.

## Modellkosten

Beträge in USD. Für ältere Aufrufe ohne Einzelpreis wurden gemessene Eingabe- und Ausgabetokens zum anhand echter Gateway-Belege geprüften EU-Tarif bewertet. Thinking ist in der SDK-Ausgabetokenzahl enthalten. Fehlende Preisbelege und nicht erfasste abgebrochene Aufrufe können den Rechnungsbetrag erhöhen. Die Redaktion und Zweitbewertung sind separat gekennzeichnet.

| Wissensstand | Erfassung aller Versuche | Ohne Preisbeleg | Zusätzliche Durchläufe über denselben Fall | Hochrechnung je 30 Tage |
| --- | ---: | ---: | ---: | ---: |
| draft_preview | 0.5877 | 10 | 66 | 1.0614 |
| approved | 0.4641 | 10 | 65 | 0.8439 |

Hochrechnung für 13 Antworten pro Tag anhand der letzten Ausführung je Fall. Die Hochrechnung enthält keine Annahme über künftige Cache-Treffer.

## Technische Fehler

- `draft_preview/A05` · model_timeout (compose, HTTP —)
- `draft_preview/A06` · model_timeout (compose, HTTP —)
- `draft_preview/A09` · model_timeout (compose, HTTP —)
- `draft_preview/A20` · model_timeout (compose, HTTP —)
- `approved/A05` · model_timeout (compose, HTTP —)
- `approved/A06` · model_timeout (compose, HTTP —)
- `approved/A09` · model_timeout (compose, HTTP —)
- `approved/A20` · model_timeout (compose, HTTP —)

## Alte Muster und Korrekturansätze

### generic_handoff

Konkrete Hilfe fehlt vor der Übergabe. Die Antwort zuerst auf das lösbare Anliegen und danach auf die echte Aufgabe fürs Team prüfen.

- `draft_preview` · A03, A05, A06, A09, A10, A14, A20, A27, A35, A43, A44, A55, A56, A63, A72, A77, A80, A93, A94, A96, A97, B04, B12, B13, B15, B18, B22, B30, B41, B43, B48, B51, B53, B55, B56, B61, B62, B65, B66, B73, B80, B82, B86, B95, L01, L02, L09, L12, L13, L21, L24
- `approved` · A03, A05, A06, A09, A10, A15, A20, A26, A27, A29, A30, A35, A36, A44, A45, A55, A69, A72, A80, A86, A87, A88, A93, A94, A95, A97, A99, B02, B03, B04, B06, B08, B12, B15, B22, B25, B40, B47, B48, B49, B51, B55, B57, B61, B62, B66, B73, B75, B88, B91, B93, B94, B96, L07, L08, L09, L21, L22, L24, L25, L27, L30

### generic_patient_question

Die Identitätsfrage ist losgelöst vom Anliegen. An den konkreten Fall binden und Vorwissen nutzen.

- `draft_preview` · A18, A48, A68, A85, B16, B35, L28
- `approved` · A42, A61, A68, B10, B31, B37, B50, B70, B76, L28

### portal_access_boilerplate

Eine Systemgrenze wird ohne Hilfestellung beschrieben. Den echten Zugriffspfad oder den konkreten nächsten Schritt nennen.

- `draft_preview` · A26, A47, A75, A98, B02, B29, B66, B85, L05, L08, L09, L10, L16, L17, L25
- `approved` · A74, B02, B29, B36, B45, B53, B58, B66, B85, L05, L12, L17, L25

### reply_time_boilerplate

Die Rückmeldezeit ist ein Standardsatz. Angeben, was das Team bis dahin tatsächlich klärt.

- `draft_preview` · A03, A05, A06, A09, A10, A13, A14, A15, A16, A17, A20, A23, A26, A27, A29, A30, A35, A41, A43, A44, A45, A47, A49, A54, A55, A56, A59, A62, A63, A69, A70, A72, A74, A77, A80, A81, A83, A84, A86, A87, A88, A93, A94, A96, A97, B03, B04, B06, B12, B13, B15, B18, B22, B27, B29, B30, B31, B36, B40, B41, B43, B45, B47, B48, B49, B51, B53, B55, B56, B58, B61, B62, B65, B66, B67, B68, B73, B76, B77, B79, B80, B82, B85, B86, B87, B88, B92, B93, B96, L01, L02, L07, L08, L09, L12, L13, L14, L17, L21, L22, L23, L24, L25, L26, L27, L28, L30, L32
- `approved` · A03, A04, A05, A06, A07, A09, A10, A15, A17, A20, A23, A26, A27, A29, A30, A35, A36, A43, A44, A45, A55, A56, A59, A62, A63, A69, A70, A72, A74, A75, A77, A80, A83, A84, A86, A87, A88, A92, A93, A94, A95, A96, A97, A98, A99, B02, B03, B04, B06, B08, B12, B15, B16, B17, B19, B20, B21, B22, B23, B25, B27, B29, B30, B33, B36, B40, B45, B46, B47, B48, B49, B51, B52, B55, B58, B60, B61, B62, B66, B68, B73, B75, B77, B84, B88, B91, B92, B93, B94, B96, L07, L08, L09, L12, L13, L14, L17, L21, L22, L23, L24, L25, L26, L27, L30


## Zehn stärkste Antworten

**approved/A19 · 9/10**

Eingang

> Hallo,
> ich habe heute um 15:30 Uhr einen Termin. Leider hat meine Bahn Ausfall und Verspätung, daher kann es sein, dass ich etwa 10 Minuten später komme.
> MfG [Person]

Antwort

> Vielen Dank für Ihre Info. Kommen Sie bitte trotzdem zu Ihrem Termin heute um 15:30 Uhr, eine Verspätung von etwa 10 Minuten ist kein Problem. Falls es deutlich später wird, rufen Sie bitte an: [Telefon].

**draft_preview/A08 · 9/10**

Eingang

> Ich möchte eine Sprechtermin mit die Dr. [Person] machen

Antwort

> Gerne helfe ich Ihnen dabei. Sie können den Sprechtermin bei Dr. [Person] direkt online über Doctolib buchen: [Link] Worum soll es bei dem Termin gehen, zum Beispiel um eine Kontrolle oder eine Besprechung?

**draft_preview/A19 · 9/10**

Eingang

> Hallo,
> ich habe heute um 15:30 Uhr einen Termin. Leider hat meine Bahn Ausfall und Verspätung, daher kann es sein, dass ich etwa 10 Minuten später komme.
> MfG [Person]

Antwort

> Vielen Dank für die Info. Bei etwa 10 Minuten Verspätung kommen Sie einfach zu Ihrem Termin um 15:30 Uhr, eventuell mit ein wenig Wartezeit. Sollte es doch später werden, rufen Sie bitte [Person] unter [Telefon] an, dann können wir schauen, ob der Termin heute noch klappt.

**draft_preview/A89 · 9/10**

Eingang

> Hallo, es tut mir leid, dass ich heute nicht vorbeigekommen bin, um dir die Rate zu geben – ich bin nämlich müde. Aber morgen komme ich vorbei.

Antwort

> Das ist kein Problem, du musst dich nicht entschuldigen. Komm morgen einfach während der Sprechzeiten am Empfang vorbei, Dienstag bis Donnerstag von 9 bis 13 und von 14 bis 18:30 Uhr, und gib die Rate dort ab. Ruh dich heute gut aus.

**draft_preview/B26 · 9/10**

Eingang

> Sehr geehrte Damen und Herren, meine [Person] [Patient] ist bei Ihnen Bestandspatientin. Sie hat auf den neuen Aligner Nr. 26 gewechselt und dieser sitzt zu locker und lässt sich hinten nicht einklicken. Wir haben Nr. 27 probehalber auch probiert, aber dieser sitzt ebenfalls zu locker und lässt sich auch hinten nicht einklicken.
>
> Bitte teilen Sie uns mit wie wir weiter verfahren sollen.

Antwort

> Sehr geehrte Damen und Herren, es tut mir leid, dass der Aligner Nr. 26 bei [Person] so locker sitzt und sich hinten nicht einklicken lässt. Bitte tragen Sie bis zur Klärung wieder die vorherige Schiene, die gut gepasst hat, und bewahren Sie alle alten Schienen auf. Mit den Kausticks (Chewies) können Sie die Schiene mehrmals täglich festbeißen. Für die Aligner-Kontrolle können Sie über den Buchungslink einen Termin wählen oder während der Sprechzeiten [Person] bis [Person] spontan mit Wartezeit vorbeikommen, bitte dann alle Schienen mitbringen. Der Empfang gibt an das Team weiter, ob die Aligner Nr. 26 und 27 angepasst oder neu hergestellt werden müssen. Sie hören am Mittwoch, 3. Dezember bis 10 Uhr von uns.

**approved/A01 · 8/10**

Eingang

> [Person] kfo Team, aufgrund von schienenersatzverkehr kommt [Person]. [Person] erst 17:06 bzw 18:06 am bhf an und verspäten sich dadurch um wenige Minuten. Ich bitte um Verständnis. Vg [Person]

Antwort

> Vielen Dank für Ihre Nachricht und dass Sie uns so früh Bescheid geben. Der Schienenersatzverkehr ist ärgerlich, und ein paar Minuten Verspätung sind kein Problem. Bitte kommen Sie einfach zur Anmeldung, sobald Sie da sind. Bei Fragen erreichen Sie uns unter [Telefon].

**approved/A13 · 8/10**

Eingang

> Guten Tag. [Person] hat heute um 14.45 einen Termin. Sie ist aber gerade von der Schule zurück und fühlt sich unwohl-Fieber und Kopfschmerzen. Ich möchte gern den Termin verschieben

Antwort

> Guten Tag, das tut mir leid, dass es [Person] gerade nicht gut geht, und ich wünsche ihr gute Besserung. Der Empfang prüft den heutigen Termin um 14:45 Uhr und sucht einen passenden neuen Termin, sobald es ihr wieder besser geht. Falls sich ihr Zustand verschlechtert oder starke Schmerzen auftreten, rufen Sie bitte sofort unter [Telefon] an. Wann wäre es Ihnen denn recht, damit der Empfang gezielt suchen kann? Sie hören heute bis 17 Uhr von uns.

**approved/A41 · 8/10**

Eingang

> Hallo ,
>
> [Person] Frage , wäre es möglich den heutigen Termin zu verschieben , heute Nachmittag vlt? Meine [Person] kann leider nicht kommen. Heute wird alles organisatorisches in der Schule besprochen.
>
> Freundliche Grüße [Person]

Antwort

> Guten Tag [Person] , das verstehe ich, heute wird in der Schule viel besprochen. Der Empfang prüft, ob heute am Nachmittag ein Termin für Ihre [Person] ist, und schlägt Ihnen dann eine Zeit vor. Welche Uhrzeit am Nachmittag würde für Sie denn am besten passen? Sie hören heute bis 12 Uhr von uns.

**approved/A47 · 8/10**

Eingang

> Hallo, der noch offene Posten wurde ausgeglichen.  [Person] -> Überweisung erfolgt durch N.[Person] .
> Lg [Person]

Antwort

> Danke für die Information, dass der offene Betrag ausgeglichen wurde. Der Empfang prüft den Zahlungsstand und ob die Dezember-Rechnung über 102,44 € inzwischen bei Ihnen angekommen ist. Sobald das geklärt ist, melden wir uns mit dem Ergebnis. Sie hören heute bis 12 Uhr von uns.

**approved/B11 · 8/10**

Eingang

> Guten Tag, Dr. [Person]. Ich bin [Person] . Wir kommen mit Verspätung daher der Zug kurzfristig abgesagt wurde.
> Dankeschön

Antwort

> Guten Tag, danke für die Info zur Verspätung. Das ist kein Problem, kommen Sie bitte sicher an. Wir freuen uns auf Sie.


## Zehn schwächste Antworten

**draft_preview/B62 · 1/10**

Eingang

> Vielen Dank, ich werde am Mittwoch, den 14. Oktober 2026 um 14:15 Uhr dort sein.

Antwort

> Ich kläre mit der Rezeption, was wir für Sie tun können. Sie hören heute bis 12 Uhr von uns.

**draft_preview/B53 · 1/10**

Eingang

> Ich bin auch wieder da, wann darf ich kommen?

Antwort

> Ich kläre mit der Rezeption, was wir für Sie tun können. Sie hören heute bis 17 Uhr von uns.

**draft_preview/B51 · 1/10**

Eingang

> Hallo [Person] dr. [Person] schicken sie mir die Bilder 😂☺️😊

Antwort

> Ich kläre mit der Rezeption, was wir für Sie tun können. Sie hören heute bis 17 Uhr von uns.

**draft_preview/B48 · 1/10**

Eingang

> Hallo, da hatten Sie mir letztens aber was anderes gesagt, da Sie ja jetzt ein aktuelles Röntgen Bild haben und Fr.  [Person] sich dies angeschaut hat , meinten Sie das der oben liegende Zahlen auch mit raus soll.

Antwort

> Ich kläre mit der Rezeption, was wir für Sie tun können. Sie hören heute bis 17 Uhr von uns.

**draft_preview/B22 · 1/10**

Eingang

> Danke sehr! [Person] kommt morgen um 16:30.

Antwort

> Ich kläre mit der Rezeption, was wir für Sie tun können. Sie hören am Dienstag, 25. [Person] bis 10 Uhr von uns.

**draft_preview/B18 · 1/10**

Eingang

> Hallo, ich kann sie am Montag abholen kommen.
> Viele Grüße [Person]

Antwort

> Ich kläre mit der Rezeption, was wir für Sie tun können. Sie hören heute bis 17 Uhr von uns.

**draft_preview/A97 · 1/10**

Eingang

> [Person] Praxisteam, zu welcher Uhrzeit soll ich am Montag kommen?

Antwort

> Ich kläre mit der Rezeption, was wir für Sie tun können. Sie hören heute bis 17 Uhr von uns.

**draft_preview/A94 · 1/10**

Eingang

> 15 Uhr Heute?

Antwort

> Ich kläre mit der Rezeption, was wir für Sie tun können. Sie hören heute bis 17 Uhr von uns.

**draft_preview/A77 · 1/10**

Eingang

> Vielen Dank! 🙌🏽
> Ich war mir unsicher, ob dies die richtige Kontonummer ist, daher habe ich lieber nachgefragt. Ich werde die Überweisung umgehend vornehmen, nochmals vielen Dank!
>
> Grüße [Person]

Antwort

> Ich kläre mit der Rezeption, was wir für dich tun können. Du hörst am Dienstag, 27. Oktober bis 10 Uhr von uns.

**draft_preview/A35 · 1/10**

Eingang

> Guten Tag,
> mein Name ist [Person]. Ich schreibe wegen meiner [Person] [Patient] (geb. [Datum]).
> Laut der Rechnung [Person] [Datum] sollten 144,11 € ab dem [Datum] automatisch von meinem Konto abgebucht werden. Das Geld wurde bisher jedoch nicht abgebucht. Was soll ich jetzt tun? Wird die Lastschrift noch einmal eingezogen oder soll ich den Betrag selbst überweisen?
> Außerdem hat meine [Person] [Patient] mit ihrer Zahnspange. Ich habe gesehen, dass die nächsten Termine erst wieder ab [Person] verfügbar sind. Wann könnten wir vorbeikommen?
> Vielen Dank für Ihre Rückmeldung.
> Mit freundlichen Grüße [Person]

Antwort

> Ich kläre mit der Rezeption, ob der Termin bei uns eingetragen ist. Sie hören am Dienstag, 21. [Person] bis 10 Uhr von uns.
