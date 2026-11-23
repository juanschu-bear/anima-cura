# AnimaHost · Abnahme mit Regelbuch 9

Lauf `retrieval-v9-5de9d717-f923-4ab6-acd4-ea87a2078bfd` · 2026-11-23T22:55:16.099Z. Antwortlogik `cc615c4`, zwei Wissensstände, je 239 archivierte Eingänge. Die Ausführung erlaubt bis zu 60 Sekunden pro Fall für die Wiederholung vorübergehender Provider-Fehler. Im Live-Betrieb gilt das eigene Zeitfenster. Kein Versand.

**Abnahme offen.** Technische Fehler 0. Bei 233 von 287 erzeugten Antworten markierte die Zweitprüfung mindestens ein Sprachmuster. Die Kategorien können sich überschneiden. Beide Wissensstände wurden anhand derselben archivierten Fälle bewertet.

| Status | Entwurf | Freigegeben |
| --- | ---: | ---: |
| chain:guard_rejected | 1 | 0 |
| conversation:clarify_first | 10 | 10 |
| draht-sticht-oder-etwas-tut-weh | 1 | 1 |
| retrieval:answered | 133 | 132 |
| sender:non_patient | 4 | 5 |
| sender:team | 3 | 3 |
| social:acknowledged | 79 | 80 |
| social:reaction | 2 | 2 |
| social:unreadable | 6 | 6 |

Median der Erzeugungszeit nur für vorhandene Antworttexte, ohne Versandzeit oder unbeantwortete Fälle.

- `draft_preview` · 7546 ms bei 144 Antworten
- `approved` · 7449 ms bei 143 Antworten

## Modellkosten

Beträge in USD. Für ältere Aufrufe ohne Einzelpreis wurden gemessene Eingabe- und Ausgabetokens zum anhand echter Gateway-Belege geprüften EU-Tarif bewertet. Thinking ist in der SDK-Ausgabetokenzahl enthalten. Fehlende Preisbelege und nicht erfasste abgebrochene Aufrufe können den Rechnungsbetrag erhöhen. Die Redaktion und Zweitbewertung sind separat gekennzeichnet.

| Wissensstand | Erfassung aller Versuche | Ohne Preisbeleg | Zusätzliche Durchläufe über denselben Fall | Hochrechnung je 30 Tage |
| --- | ---: | ---: | ---: | ---: |
| draft_preview | 0.4895 | 3 | 62 | 1.0799 |
| approved | 0.3148 | 2 | 4 | 0.8547 |

Hochrechnung für 13 Antworten pro Tag anhand der letzten Ausführung je Fall. Die Hochrechnung enthält keine Annahme über künftige Cache-Treffer.

Die beiden Läufe zusammen ergeben **0,8043 USD** aus den erfassten Tokenmengen. Der Gateway-Bericht weist im gesamten Generierungszeitfenster (23.11., 23:00–23:59 Uhr Berlin) **0,8240 USD** für das Modell aus, nach Abzug der markierten Diagnose- und Namensprüfungen. Dieser Stundenwert kann unmarkierte Kurzproben enthalten. Modellkosten für Namensprüfung und unabhängige Zweitbewertung zusammen **1,3679 USD**, direkt nach den jeweiligen Markierungen im Gateway. Die Hochrechnung für den freigegebenen Wissensstand beträgt **0,85 USD je 30 Tage**.

## Technische Fehler

Keine terminalen technischen Fehler. Wiederholte und erfolgreich beendete Fehler stehen je Fall im JSON. Beim Wiederanlauf liefen kurz zwei Prozesse mit demselben Entwurfsprotokoll. Seine 62 zusätzlichen Durchläufe über dieselben Fälle zählen zu den Kosten. Die Statusverteilung berücksichtigt pro Wissensstand jeweils nur die letzte Ausführung je Fall. Eine Sperre verhindert künftig zwei gleichzeitige Läufe auf dieselbe Ausgabedatei.

## Alte Muster und Korrekturansätze

### generic_handoff

Konkrete Hilfe fehlt vor der Übergabe. Die Antwort zuerst auf das lösbare Anliegen und danach auf die echte Aufgabe fürs Team prüfen.

- `draft_preview` · A18, A23, A27, A29, A30, A36, A41, A45, A47, A49, A54, A59, A63, A84, A87, A92, A93, A94, A96, A97, B02, B04, B15, B17, B18, B19, B20, B21, B25, B26, B29, B31, B45, B47, B48, B51, B52, B55, B59, B61, B66, B68, B76, B80, B82, B85, B86, B87, B92, B93, B94, B96, B99, L03, L05, L08, L09, L10, L14, L16, L17, L21, L22, L23, L30, L32
- `approved` · A07, A12, A14, A15, A17, A18, A23, A26, A27, A30, A35, A37, A41, A45, A47, A48, A49, A56, A59, A63, A69, A73, A74, A83, A87, A93, A95, A96, A97, A99, B04, B15, B18, B19, B20, B21, B25, B26, B27, B29, B31, B36, B40, B45, B47, B48, B49, B50, B51, B52, B55, B56, B57, B58, B59, B61, B66, B80, B82, B84, B85, B87, B92, B94, B96, L02, L03, L04, L06, L08, L09, L10, L12, L13, L14, L16, L17, L21, L22, L23, L24, L25, L28, L30, L32, L35, L39

### generic_patient_question

Die Identitätsfrage ist losgelöst vom Anliegen. An den konkreten Fall binden und Vorwissen nutzen.

- `draft_preview` · A08, A17, A26, A27, A37, A41, A42, A45, A48, A56, A61, A68, A73, A74, A81, A84, A85, A94, A97, A98, B11, B15, B19, B24, B25, B35, B36, B40, B42, B47, B48, B51, B52, B53, B54, B55, B59, B60, B66, B68, B71, B79, B80, B82, B86, B87, B92, B93, B94, B96, B99, B100, L01, L02, L03, L04, L05, L06, L07, L08, L09, L13, L16, L17, L21, L22, L28, L35, L39
- `approved` · A07, A08, A18, A27, A36, A37, A41, A45, A56, A61, A68, A73, A74, A75, A81, A83, A85, A94, A95, A96, A97, A98, B02, B10, B11, B15, B19, B21, B24, B25, B27, B31, B36, B42, B49, B51, B53, B55, B59, B60, B63, B66, B68, B71, B77, B78, B79, B80, B82, B87, B92, B93, B94, B100, L01, L02, L03, L04, L05, L06, L07, L08, L09, L12, L16, L17, L23, L25, L28, L35, L39

### portal_access_boilerplate

Eine Systemgrenze wird ohne Hilfestellung beschrieben. Den echten Zugriffspfad oder den konkreten nächsten Schritt nennen.

- `draft_preview` · A17, A26, A98, B58, L14, L25
- `approved` · A35, A48, A54, A75, A96, A98, B25, B45, B58, B80, B82, L05, L08, L09, L10, L12, L21

### reply_time_boilerplate

Die Rückmeldezeit ist ein Standardsatz. Angeben, was das Team bis dahin tatsächlich klärt.

- `draft_preview` · A01, A14, A18, A23, A26, A27, A30, A35, A36, A49, A74, A81, A92, A93, A94, A95, A97, A99, B02, B03, B04, B11, B25, B47, B48, B49, B51, B52, B55, B56, B76, B82, B87, L03, L04, L05, L08, L09, L10, L12, L13
- `approved` · A15, A16, A17, A18, A26, A27, A29, A30, A35, A37, A41, A45, A47, A48, A49, A54, A56, A62, A63, A69, A70, A73, A74, A93, A95, A96, A97, A99, B02, B03, B04, B11, B15, B17, B18, B21, B25, B26, B27, B29, B31, B36, B40, B48, B49, B50, B51, B52, B55, B56, B57, B58, B59, B61, B66, L02, L03, L04, L05, L06, L08, L09, L10, L12, L13, L14, L16, L17, L21, L22, L23, L24, L30, L32


## Zehn stärkste Antworten

**approved/L26 · 9/10**

Eingang

> Guten Morgen, bei [Person] sei wohl wieder ein Draht abgebrochen....
> Wäre es möglich, das [Person] donnerstags Nachmittag einen Termin bekommen könnte?
>
> Mit freundlichen Grüße [Person]

Antwort

> Guten Morgen, das ist ärgerlich, dass bei [Person] schon wieder ein Draht abgebrochen ist. Heben Sie den Draht bitte auf und bringen Sie ihn mit. Falls etwas drückt oder sticht oder [Person] Schmerzen hat, rufen Sie uns direkt an unter [Telefon]. Sonst können Sie während der Sprechzeiten von Dienstag bis Donnerstag spontan vorbeikommen, dann mit etwas Wartezeit, oder wir vereinbaren einen festen Termin. Den Wunsch nach einem Donnerstagnachmittag gebe ich an das Team weiter, die Rückmeldung kommt heute noch. Was ist Ihnen lieber?

**draft_preview/B01 · 9/10**

Eingang

> Morgen 16 Uhr ist leider nicht möglich. Unter was buche ich für [Person] ein Termin? MB Kontrolle würde ich schätzen? Dann buche ich über Doctolib einen Termin - ich hatte schon wieder vergessen das [Person] dort Termine buchen kann. Ich bitte dies zu entschuldigen.

Antwort

> Dafür müssen Sie sich nicht entschuldigen, das passiert vielen. Für [Person] passt eine Kontrolle der festen Zahnspange, die buchen Sie am besten direkt über Doctolib. Geben Sie beim Buchen bitte den Namen an, so wie er in Ihrer Terminbestätigung steht.

**draft_preview/L26 · 9/10**

Eingang

> Guten Morgen, bei [Person] sei wohl wieder ein Draht abgebrochen....
> Wäre es möglich, das [Person] donnerstags Nachmittag einen Termin bekommen könnte?
>
> Mit freundlichen Grüße [Person]

Antwort

> Das ist ärgerlich, dass wieder ein Draht abgebrochen ist. Bitte heben Sie das abgebrochene [Person] auf und bringen Sie es zum Termin mit. Scharfe Enden können Sie vorsichtig mit etwas Wachs abdecken, und bis zur Reparatur ist weiche Kost gut. Ihren Wunsch nach einem Donnerstagnachmittag gebe ich an das Team weiter, die Rückmeldung kommt heute noch. Drückt oder sticht gerade etwas, oder hat [Person] Schmerzen? Dann rufen Sie uns bitte direkt an unter [Telefon]. Wenn nicht, können Sie während der Sprechzeiten Dienstag bis Donnerstag auch spontan vorbeikommen, dann mit etwas Wartezeit.

**draft_preview/L02 · 9/10**

Eingang

> Hallo, bei mir ist ein Attachment abgegangen. Kann ich spontan in der [Person] vorbeikommen?

Antwort

> Hallo, das lässt sich gut beheben und ist kein Notfall. Trag die Schiene einfach weiter wie gewohnt, das Attachment musst du nicht aufheben, es wird in der [Person] neu angebracht. Du kannst dienstags bis donnerstags während der Sprechzeiten spontan vorbeikommen, dann mit etwas Wartezeit. Oder du buchst direkt einen festen Termin zur Aligner-Kontrolle: [Link] Wenn die Schiene drückt oder wehtut, ruf uns bitte an: [Telefon]. Unter welchem Namen bist du bei uns angemeldet?

**draft_preview/L39 · 9/10**

Eingang

> Kunststoff  Unterkiefer ab. Tut weh, nächstgelegen Termin ist in Dezember.  Zu lange warten.

Antwort

> Das tut mir leid, dass es schmerzt. Bitte heben Sie alle Teile auf und bringen Sie sie mit, kleben Sie nichts selbst. Bis Dezember müssen Sie nicht warten: Sie können dienstags bis donnerstags zu unseren Sprechzeiten (9:00 bis 13:00 und 14:00 bis 18:30 Uhr) ohne Termin vorbeikommen, dann allerdings mit Wartezeit. Ihren Wunsch nach einem früheren Termin gebe ich direkt an das Team weiter, Rückmeldung heute noch. Werden die Schmerzen stärker, erreichen Sie uns sofort unter [Telefon]. Unter welchem Namen sind Sie bei uns angemeldet?

**approved/A01 · 8/10**

Eingang

> [Person] kfo Team, aufgrund von schienenersatzverkehr kommt [Person]. [Person] erst 17:06 bzw 18:06 am bhf an und verspäten sich dadurch um wenige Minuten. Ich bitte um Verständnis. Vg [Person]

Antwort

> Vielen Dank für die Information zum Schienenersatzverkehr. Bis zu 15 Minuten Verspätung sind in Ordnung, kommen Sie einfach vorbei. Falls Sie merken, dass es doch mehr wird, melden Sie sich bitte [Person] bei uns unter [Telefon].

**approved/B01 · 8/10**

Eingang

> Morgen 16 Uhr ist leider nicht möglich. Unter was buche ich für [Person] ein Termin? MB Kontrolle würde ich schätzen? Dann buche ich über Doctolib einen Termin - ich hatte schon wieder vergessen das [Person] dort Termine buchen kann. Ich bitte dies zu entschuldigen.

Antwort

> Kein Problem, danke für den Hinweis. Ja, MB-Kontrolle ist die passende Terminart. Bitte buchen Sie unter dem Namen, unter dem [Person] bei uns angemeldet ist. Den können Sie hier im Chat nicht prüfen, deshalb ist er bei der Buchung wichtig. Den freien Termin wählen Sie direkt über Doctolib: [Link]

**approved/B54 · 8/10**

Eingang

> Der Retainer hat sich mittlerweile komplett gelöst. Soll trotzdem ein Termin über Reparatur Retainer gemacht werden?
> Vielen Dank!

Antwort

> Ja, bitte vereinbaren Sie dafür einen Termin zur Reparatur Ihres Retainers über diesen Link: [Link] Bringen Sie bitte alle Teile des Retainers mit, die Sie noch haben. Falls etwas sticht oder schmerzt, rufen Sie uns bitte direkt an unter [Telefon]. Unter welchem Namen sind Sie bei uns angemeldet?

**draft_preview/A13 · 8/10**

Eingang

> Guten Tag. [Person] hat heute um 14.45 einen Termin. Sie ist aber gerade von der Schule zurück und fühlt sich unwohl-Fieber und Kopfschmerzen. Ich möchte gern den Termin verschieben

Antwort

> Guten Tag, gute Besserung für [Person]. Ich gebe Ihren Wunsch, den heutigen Termin um 14:45 Uhr zu verschieben, direkt ans Team weiter, Rückmeldung heute noch. Bitte schonen Sie [Person], und falls sich Schmerzen oder Beschwerden verschlimmern, rufen Sie uns direkt an unter [Telefon].

**draft_preview/A16 · 8/10**

Eingang

> Guten Tag
> Ich wollte den Termin von [Person] am 20.3 17uhr absagen

Antwort

> Guten Tag, danke, dass Sie uns Bescheid geben. Ich habe die Absage des Termins für [Person] am 20.03. um 17:00 Uhr für das Praxisteam vermerkt. Damit die Behandlung planmäßig weiterläuft, wählen Sie bitte gleich einen neuen Termin aus: [Link] Die Rückmeldung des Teams erfolgt am Dienstag, 17. März.


## Zehn schwächste Antworten

**approved/L09 · 2/10**

Eingang

> Nein, nicht Abrechnung die Rechnungen, die angeblich in der App zu sehen sein sollten

Antwort

> Danke für die Klarstellung, dann geht es um die Rechnungen in der App. Ich kann hier im Chat nicht einsehen, welche Rechnungen für Sie hinterlegt sind, deshalb gebe ich Ihre Nachricht direkt an das Praxisteam weiter. Unser Team meldet sich am Montag, 23. November, bei Ihnen. Unter welchem Namen sind Sie bei uns angemeldet?

**approved/L08 · 2/10**

Eingang

> Ich habe mich in der App angemeldet, um die Rechnungen zu sehen, aber leider sind dort meine Rechnungen noch nicht sichtbar

Antwort

> Danke für Ihre Nachricht. Ich gebe Ihr Anliegen direkt an das Praxisteam weiter, da Ihre Rechnungen in der App bei Ihnen noch nicht angezeigt werden. Unser Team meldet sich bei Ihnen am Montag, 23. November. Falls Sie vorher dringend etwas klären möchten, erreichen Sie die [Person] unter [Telefon]. Unter welchem Namen sind Sie bei uns angemeldet?

**approved/L06 · 2/10**

Eingang

> Ich möchte mich nicht bei der Epp App anmelden. Ist es denn unbedingt nötig ich möchte mir keine App downloaden.

Antwort

> Verstanden, Sie möchten keine App herunterladen. Ich gebe Ihre Frage, ob die Anmeldung bei der App unbedingt nötig ist, an das Praxisteam weiter. Unser Team meldet sich am Montag, 23. November bei Ihnen. Unter welchem Namen sind Sie bei uns angemeldet?

**approved/B51 · 2/10**

Eingang

> Hallo [Person] dr. [Person] schicken sie mir die Bilder 😂☺️😊

Antwort

> Gern gebe ich Ihre Bitte um die Bilder an das Praxisteam weiter, das sich heute noch bei Ihnen meldet. Unter welchem Namen sind Sie bei uns angemeldet?

**approved/A73 · 2/10**

Eingang

> Hätte*

Antwort

> Danke für Ihre Nachricht. Ich habe Ihren dringenden Terminwunsch für die Kontrolle und Ihre Frage zur Rechnung der Behandlung an das Praxisteam weitergegeben, Rückmeldung heute noch. Unter welchem Namen sind Sie bei uns angemeldet?

**draft_preview/A49 · 2/10**

Eingang

> Hallo können sie bitte die Tür unten aufmachen. [Person] hat noch ein Termin. LG [Person]

Antwort

> Guten Tag [Person] , ich gebe Ihre Bitte um Öffnung der Tür sofort an das Praxisteam weiter. Das Team meldet sich bei Ihnen am Mittwoch, 9. September. Falls Sie vorher dringend Hilfe benötigen, erreichen Sie die [Person] telefonisch unter [Telefon].

**approved/B50 · 2/10**

Eingang

> Hallo, das mache ich lieber selber, ich habe die Woche darauf keine Zeit.
> Viele Grüße [Person]

Antwort

> Vielen Dank für Ihre Nachricht, [Person] . Ich gebe weiter, dass Sie das lieber selbst übernehmen möchten und die Woche darauf keine Zeit haben. Unser Team meldet sich bei Ihnen heute noch.

**approved/A30 · 2/10**

Eingang

> [Person] , schicken Sie es bitte einzeln, das wäre mir lieber. Viele Grüße [Person]

Antwort

> Das machen wir so, [Person] . Ich gebe Ihren Wunsch, die Unterlagen einzeln zu senden, und die Frist bis zum 10.7. an das Team weiter. Ihre Rückmeldung erhalten Sie heute noch.

**approved/A15 · 2/10**

Eingang

> Bis wann dürfen wir am Montag kommen ?

Antwort

> Die genaue Uhrzeit für Montag kann ich Ihnen leider nicht selbst nennen. Ich gebe Ihre Frage an das Praxisteam weiter, das sich am Montag, 16. März, bei Ihnen meldet und Ihnen mitteilt, bis wann Sie kommen können. Sollten die Beschwerden stärker werden, rufen Sie uns bitte direkt unter [Telefon] an.

**draft_preview/A85 · 2/10**

Eingang

>

Antwort

> Ich helfe Ihnen gern. Worum geht es?
