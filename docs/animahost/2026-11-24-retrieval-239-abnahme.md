# AnimaHost · Abnahme mit Regelbuch 10

Lauf `retrieval-v10-e9d2a9bf-86a0-45ef-a2fc-9e143cde8607` · 2026-11-23T23:32:52.554Z. Antwortlogik `4d07534`, zwei Wissensstände, je 239 archivierte Eingänge. Die Ausführung erlaubt bis zu 60 Sekunden pro Fall für die Wiederholung vorübergehender Provider-Fehler. Im Live-Betrieb gilt das eigene Zeitfenster. Kein Versand.

**Abnahme offen.** Technische Fehler 0. Antworten mit alten Mustern 141.

| Status | Entwurf | Freigegeben |
| --- | ---: | ---: |
| billing:portal_browser | 3 | 3 |
| billing:portal_missing | 3 | 3 |
| chain:guard_rejected | 3 | 12 |
| conversation:clarify_first | 9 | 9 |
| conversation:practice_reply | 8 | 8 |
| draht-sticht-oder-etwas-tut-weh | 1 | 1 |
| retrieval:answered | 126 | 115 |
| sender:non_patient | 3 | 4 |
| sender:team | 3 | 3 |
| social:acknowledged | 72 | 73 |
| social:reaction | 2 | 2 |
| social:unreadable | 6 | 6 |

Median der Erzeugungszeit nur für vorhandene Antworttexte, ohne Versandzeit oder unbeantwortete Fälle.

- `draft_preview` · 7715.5 ms bei 142 Antworten. 48 Antworten mit mindestens einem Muster. Identitätsfragen bei bekannten Patienten 0 unter 143 ausgewerteten bekannten Fällen.
- `approved` · 6775 ms bei 131 Antworten. 93 Antworten mit mindestens einem Muster. Identitätsfragen bei bekannten Patienten 0 unter 143 ausgewerteten bekannten Fällen.

## Vergleich und Stichproben

| Maß | Entwurf 23.11. | Entwurf 24.11. | Freigegeben 23.11. | Freigegeben 24.11. |
| --- | ---: | ---: | ---: | ---: |
| Mit mindestens einer Markierung | 112 von 144 | 48 von 142 | 121 von 143 | 93 von 131 |
| Durch den Antwortprüfer zurückgehalten | 1 | 3 | 0 | 12 |
| Ohne Nachricht zur Praxis weitergeführt | 0 | 8 | 0 | 8 |

Die Gesamtwertung verfehlt die Vorgabe von weniger als zehn markierten Antworten je Wissensstand. Die Zweitbewertung markiert auch konkrete Aufgaben des Empfangs, etwa wenn bei einer langfristigen Terminanfrage nur die Praxis den Kalender prüfen kann. Die separate Textprüfung fand in beiden Endläufen **0 wörtliche alte Standardübergaben**, **0 Formulierungen „kann ich hier nicht einsehen“ oder die geprüften Varianten** und **0 Standardfragen „Unter welchem Namen“ oder „Für welchen Patienten schreiben Sie“**. Die Tabelle oben verwendet weiterhin die strengere unabhängige Bewertung. Die 143 Fälle je Lauf mit bekannter Zuordnung hatten im eingefrorenen Bestand den Status unconfirmed. Der Schutz für confirmed ist mit eigenen Tests belegt. Frühere Praxisnachrichten zählen nur mit belegter Absenderquelle.

| Referenz | Ergebnis |
| --- | --- |
| L02 | Entwurf mit konkreter Antwort ohne Identitätsfrage. Im freigegebenen Lauf hat die Anredeprüfung die Antwort zurückgehalten. |
| L06 | In beiden Läufen direkter Hinweis auf Browserzugang und möglichen E-Mail-Versand ohne App-Download. |
| L08, L09 | In beiden Läufen nennt die Antwort den Rechnungsbereich und die konkrete Prüfung von Freigabe, Kontozuordnung und E-Mail-Versand. In den archivierten Eingängen war keine Identität bestätigt. Persönlicher Rechnungsstatus blieb daher offen. |
| Jetzt vor Ort oder kurze Verspätung | Kein passender Eingang in den 239 Fällen. Separat mit Treppenhaus, Tür und fünf Minuten Verspätung geprüft, einschließlich wichtiger Meldung und Versandplanung ohne künstliche Wartezeit. |

Die [offene Frage zum E-Mail-Versand ohne Portalzugang](2026-11-24-portal-versand-offene-frage.json) ist im Praxiswissen erfasst. Für diese Abnahme wurde keine WhatsApp-Nachricht versendet.

## Modellkosten

Beträge in USD. Für ältere Aufrufe ohne Einzelpreis wurden gemessene Eingabe- und Ausgabetokens zum anhand echter Gateway-Belege geprüften EU-Tarif bewertet. Thinking ist in der SDK-Ausgabetokenzahl enthalten. Fehlende Preisbelege und nicht erfasste abgebrochene Aufrufe können den Rechnungsbetrag erhöhen. Die Redaktion und Zweitbewertung sind separat gekennzeichnet.

| Wissensstand | Erfassung aller Versuche | Ohne Preisbeleg | Zusätzliche Durchläufe über denselben Fall | Hochrechnung je 30 Tage |
| --- | ---: | ---: | ---: | ---: |
| draft_preview | 0.4672 | 0 | 0 | 1.283 |
| approved | 0.3599 | 0 | 0 | 1.0716 |

Hochrechnung für 13 Antworten pro Tag anhand der letzten Ausführung je Fall. Die Hochrechnung enthält keine Annahme über künftige Cache-Treffer.

## Technische Fehler

Keine terminalen technischen Fehler. Wiederholte und erfolgreich beendete Fehler stehen je Fall im JSON.

## Alte Muster und Korrekturansätze

### generic_handoff

Konkrete Hilfe fehlt vor der Übergabe. Die Antwort zuerst auf das lösbare Anliegen und danach auf die echte Aufgabe fürs Team prüfen.

- `draft_preview` · A01, A16, A17, A26, A30, A84, A86, A88, A92, A93, B15, B18, B19, B21, B51, B68, L14, L27, L28
- `approved` · A07, A14, A17, A19, A25, A30, A35, A36, A41, A45, A47, A56, A59, A63, A69, A70, A74, A81, A83, A84, A86, A93, A94, A95, A96, A97, A98, A99, B02, B03, B04, B06, B26, B29, B31, B36, B40, B45, B46, B47, B48, B49, B50, B51, B55, B56, B57, B58, B60, B61, B68, B82, B84, B87, B92, B93, B94, L05, L07, L08, L09, L12, L13, L14, L15, L17, L21, L22, L23, L24, L25, L26, L27

### generic_patient_question

Die Identitätsfrage ist losgelöst vom Anliegen. An den konkreten Fall binden und Vorwissen nutzen.

- `draft_preview` · A12, A18, A42, A61, A68, A85, A88, A93, B10, B35, B50, B51, B53, B55, B68, B100
- `approved` · A12, A61, A68, A85, A97, B35, B40, B53, B70, B76, B88, B92, B94, B100, L28

### portal_access_boilerplate

Eine Systemgrenze wird ohne Hilfestellung beschrieben. Den echten Zugriffspfad oder den konkreten nächsten Schritt nennen.

- `draft_preview` · A98, B25, B29, B49, B58, L08, L09, L10, L17, L21, L32
- `approved` · A15, A47, A56, A75, A83, A99, B20, B29, B37, B80, B82, B85, L05, L17, L21, L25

### reply_time_boilerplate

Die Rückmeldezeit ist ein Standardsatz. Angeben, was das Team bis dahin tatsächlich klärt.

- `draft_preview` · A35, A86, A97, B27, L13, L21, L23, L25
- `approved` · A15, A16, A35, A62, B15, B57, B58, B68, B87, B93, L13


## Zehn stärkste Antworten

**draft_preview/A10 · 9/10**

Eingang

> Guten Tag,
> Ich komme am Donnerstag so vorbei und hole sie ab.
> Danke sehr für Bescheid!
> Mit freundlichen Grüße [Person]

Antwort

> Guten Tag, vielen Dank für Ihre Nachricht. Am Donnerstag sind wir von 9:00 bis 13:00 Uhr und von 14:00 bis 18:30 Uhr für Sie da.

**draft_preview/A37 · 9/10**

Eingang

> Guten Tag ich habe bei meiner unterem Zahnspange Probleme und kann jetzt nicht mehr zubeißen kann ich zu ihnen kommen?

Antwort

> Das tut mir leid, dass es gerade nicht mehr geht. Bitte bringen Sie die untere Zahnspange mit und versuchen Sie nicht, sie selbst zu befestigen. Wenn Sie starke Schmerzen haben oder etwas drückt oder sticht, rufen Sie bitte direkt an: [Telefon]. Sie können auch spontan zu den Sprechzeiten Dienstag bis Donnerstag vorbeikommen, dann mit Wartezeit, oder wir vereinbaren einen festen Termin. Was ist Ihnen lieber?

**draft_preview/B46 · 9/10**

Eingang

> Sehr geehrte [Person] ,
>
> Ich hoffe, Sie sind trotz der Hitze wohlauf. :)
>
> Seit heute Morgen piekt leider eine Seite bei meinem oberen retrainer und ich bleibe hin und wieder mit der Zunge hängen. Ich habe Angst, dass sich erneut etwas löst und wollte fragen, ob Sie ggf in der nächsten Woche einen Termin [Person] hätten.
>
> Vielen Dank vorab und liebe Grüße [Person]

Antwort

> Das tut mir leid, dass die Seite piekt. Bis zum Termin können Sie die reibende Stelle mit etwas Wachs abdecken, das hilft oft. Der Empfang prüft, ob in der nächsten Woche ein Termin für Ihren oberen Retainer [Person] ist. Falls sich etwas löst oder die Beschwerden stärker werden, rufen Sie bitte direkt unter [Telefon] an. Welcher Tag in der nächsten Woche passt Ihnen am besten?

**draft_preview/B54 · 9/10**

Eingang

> Der Retainer hat sich mittlerweile komplett gelöst. Soll trotzdem ein Termin über Reparatur Retainer gemacht werden?
> Vielen Dank!

Antwort

> Ja, für die Reparatur ist ein Termin sinnvoll, damit der Retainer wieder befestigt werden kann. Bitte bewahren Sie den gelösten Draht auf und bringen Sie ihn zum Termin mit, kleben Sie ihn aber nicht selbst [Person]. Den Termin können Sie hier über Doctolib buchen: [Link] Ob der Retainer nur befestigt oder komplett ersetzt werden muss, prüft das Team.

**draft_preview/B84 · 9/10**

Eingang

> Hallo liebes Team.  Hier ist [Person] die [Person] von [Person] .  Sie hatte sie kontaktiert da ihre Gummis sich verfärbt haben und sie wollte gern vor dem 30.09 nochmal einen Wechsel haben.
>
> Das ist nicht möglich?
>
> Bitte nochmal um [Person] Rückmeldung
>
> Vielen Dank [Person]

Antwort

> Guten Tag [Person] , das ist möglich, und dafür brauchen Sie keinen Termin. Gummis können Sie während der Sprechzeiten Dienstag bis Donnerstag am Empfang abholen, vormittags von 9 bis 13 Uhr und nachmittags von 14 bis 18:30 Uhr. Bitte bringen Sie möglichst ein Tütchen oder die Packung mit, falls die Größe nicht eindeutig ist. Wenn Sie den Wechsel vor dem 30.09. schaffen möchten, passt das also gut in die Sprechzeiten dieser Woche.

**draft_preview/B93 · 9/10**

Eingang

> Hallo,
> Heute kann ich leider nicht. Ist es egal wann ich vorbeikomme ob heute oder morgen oder so

Antwort

> Heute ist Dienstag, die [Person] hat bis 18:30 Uhr geöffnet, und morgen Mittwoch ebenfalls. Ohne Termin können Sie während der Sprechzeiten spontan vorbeikommen, dann müssen Sie aber mit einer längeren Wartezeit rechnen. Mit einem festen Termin entfällt das Warten, den können Sie hier buchen: [Link] Worum geht es bei Ihrem Besuch?

**draft_preview/L01 · 9/10**

Eingang

> Okay, bei mir ist ein Attachment abgegangen. Kann ich spontan in der [Person] vorbeikommen?

Antwort

> Das kommt vor und lässt sich gut beheben. Trag die Schiene bis dahin einfach weiter wie gewohnt, das Attachment musst du nicht aufheben, es wird in der [Person] neu angebracht. Du kannst am Dienstag während der Sprechzeiten (9 bis 13 Uhr oder 14 bis 18:30 Uhr) spontan vorbeikommen, dann mit etwas Wartezeit, oder du buchst dir direkt einen festen Termin zur Aligner-Kontrolle: [Link] Wenn etwas drückt oder wehtut, ruf uns sofort an unter [Telefon]. Steht dein nächster Schienenwechsel [Person] bevor? Dann schreib das dazu, damit das Team es gleich mit einplant.

**draft_preview/L02 · 9/10**

Eingang

> Hallo, bei mir ist ein Attachment abgegangen. Kann ich spontan in der [Person] vorbeikommen?

Antwort

> Das kommt vor und lässt sich gut beheben. Trag die Schiene einfach weiter wie gewohnt, das Attachment musst du nicht aufheben, es wird in der [Person] neu angebracht. Du kannst während der Sprechzeiten Dienstag bis Donnerstag spontan vorbeikommen, dann mit etwas Wartezeit, oder du buchst dir direkt einen festen Termin zur Aligner-Kontrolle: [Link] Steht dein nächster Schienenwechsel bald an? Dann schreib das [Person] dazu, damit das Team es gleich mit einplant.

**draft_preview/L26 · 9/10**

Eingang

> Guten Morgen, bei [Person] sei wohl wieder ein Draht abgebrochen....
> Wäre es möglich, das [Person] donnerstags Nachmittag einen Termin bekommen könnte?
>
> Mit freundlichen Grüße [Person]

Antwort

> Guten Morgen, das ist ärgerlich. Heben Sie das abgebrochene [Person] bitte auf und bringen Sie es zum Termin mit, scharfe Stellen können Sie bis dahin mit Wachs abdecken. Drückt oder sticht gerade etwas, oder hat [Person] Schmerzen? Dann rufen Sie uns bitte direkt unter [Telefon] an. Sonst haben Sie die Wahl: Während der Sprechzeiten Dienstag bis Donnerstag können Sie spontan vorbeikommen, dann mit etwas Wartezeit, oder Sie nehmen einen festen Termin. Der Empfang prüft, ob am Donnerstagnachmittag ein Termin für [Person] ist.

**approved/A08 · 8/10**

Eingang

> Ich möchte eine Sprechtermin mit die Dr. [Person] machen

Antwort

> Gerne helfe ich Ihnen dabei. Einen Sprechtermin bei Dr. [Person] können Sie direkt online buchen: [Link] Falls die Online-Buchung bei Ihnen nicht klappt, erreichen Sie uns telefonisch unter [Telefon].


## Zehn schwächste Antworten

**approved/B57 · 2/10**

Eingang

> Ja die brauch er dann für die Schule . Dann sind wir am 29.9 um 9 uhr da . Soll ich irgendwas bestimmtes mitbringen?

Antwort

> Vielen Dank für Ihre Nachricht. Ob der Termin am 29.09. um 9 Uhr bereits eingetragen ist und ob Sie etwas mitbringen sollten, prüft der Empfang gerade und meldet sich dann bei Ihnen. Bei Fragen erreichen Sie uns direkt unter [Telefon].

**draft_preview/L27 · 2/10**

Eingang

> Hallo guten Morgen.
>
> Es tut mir sehr leid, aber ich kann heute leider nicht zur Arbeit kommen, da ich krank bin und mich wirklich sehr schlecht fühle. Ich bitte um Entschuldigung für die kurzfristige Nachricht und hoffe auf dein Verständnis.
>
> Vielen Dank!

Antwort

> Gute Besserung, und danke für die frühe Nachricht. Es ist gut, dass Sie sich zu Hause ausruhen. Der Empfang prüft Ihre Abwesenheit für heute und meldet sich, falls noch etwas zu klären ist.

**draft_preview/L09 · 2/10**

Eingang

> Nein, nicht Abrechnung die Rechnungen, die angeblich in der App zu sehen sein sollten

Antwort

> Öffnen Sie nach dem Login den Bereich „Rechnungen“. Der Empfang prüft, ob der fehlende Beleg für Ihr Konto freigegeben und per E-Mail verschickt wurde.

**draft_preview/A85 · 2/10**

Eingang

>

Antwort

> Ich helfe Ihnen gern. Worum geht es?

**approved/B88 · 2/10**

Eingang

> Den Wink mit dem Zaunpfahl habe ich verstanden😅

Antwort

> Das war vielleicht etwas deutlich formuliert, entschuldigen Sie bitte. [Person] Sie noch eine Frage zu Ihrem Termin am Donnerstag, dem 24.9.?

**approved/B35 · 2/10**

Eingang

> ?

Antwort

> Ich helfe Ihnen gern. Worum geht es?

**draft_preview/B59 · 2/10**

Eingang

> We coming now

Antwort

> Thank you for letting us know. Please come to [Person] reception for [Person] 17:00 appointment you mentioned today. If you will be more than 15 minutes late, please call us right away at [Telefon] so [Person] team [Person] check whether it still works today.

**draft_preview/L21 · 3/10**

Eingang

> [Person] Praxisteam, ich wollte mich nochmal erkundigen wegen des Termins morgen. Wann soll ich da sein?

Antwort

> Die genaue Uhrzeit Ihres Termins morgen kann ich hier im Chat nicht einsehen. Der Empfang prüft die Uhrzeit für Sie und nennt sie Ihnen, damit Sie rechtzeitig in der [Person] sind.

**draft_preview/A88 · 3/10**

Eingang

> Sehr geehrte [Person] ,
> ich möchte mich bei Ihnen entschuldigen, aber leider kann ich heute nicht zur Arbeit kommen, da ich meinen schulischen Verpflichtungen nachkommen muss.
> Ich bitte um Ihr Verständnis.

Antwort

> Vielen Dank, dass Sie sich rechtzeitig melden. Da Sie heute wegen schulischer Verpflichtungen nicht kommen können, ist das in Ordnung. Der Empfang prüft, ob für Sie ein Ersatztermin [Person] ist, und meldet sich bei Ihnen. Könnten Sie mir bitte [Person] sagen, für welches Kind der Termin gedacht ist, damit wir ihn korrekt zuordnen?

**approved/L13 · 3/10**

Eingang

> Ich hoffe das uns [Person] am Montag antwortet

Antwort

> Das verstehe ich gut. Der Empfang prüft, ob [Person] Termin am Mittwoch auf die Woche ab dem 30.11. ab 15 Uhr verschoben werden kann, und klärt außerdem, wie es mit der Rechnung für den Termin aussieht. Bitte haben Sie noch etwas Geduld, bis die Antwort vorliegt.
