# AnimaHost · Abnahme mit Regelbuch 10

Lauf `retrieval-v10-32cefb88-55a0-491d-beca-faf024f58586` · 2026-11-24T10:08:59.727Z. Antwortlogik `4a3c697`, zwei Wissensstände, je 239 archivierte Eingänge. Die Ausführung erlaubt bis zu 60 Sekunden pro Fall für die Wiederholung vorübergehender Provider-Fehler. Im Live-Betrieb gilt das eigene Zeitfenster. Kein Versand. Nach den letzten Korrekturen wurden 30 einschlägige Fälle je Wissensstand erneut gerechnet. Der Bericht enthält je Referenz das letzte Ergebnis.

**Abnahme offen.** Technische Fehler 0. Antworten mit alten Mustern 146.

| Status | Entwurf | Freigegeben |
| --- | ---: | ---: |
| billing:debit_and_appliance | 1 | 1 |
| billing:portal_browser | 3 | 3 |
| billing:portal_missing | 3 | 3 |
| care:clarify_prior_statement | 1 | 1 |
| conversation:acknowledged | 40 | 44 |
| conversation:clarify_first | 17 | 22 |
| conversation:practice_reply | 2 | 2 |
| conversation:unreadable_language | 4 | 4 |
| draht-sticht-oder-etwas-tut-weh | 1 | 1 |
| retrieval:answered | 121 | 119 |
| retrieval:hard_review | 5 | 2 |
| sender:non_patient | 3 | 2 |
| sender:team | 3 | 3 |
| social:acknowledged | 31 | 28 |
| social:reaction | 2 | 2 |
| social:unreadable | 2 | 2 |

Median der Erzeugungszeit nur für vorhandene Antworttexte, ohne Versandzeit oder unbeantwortete Fälle.

- `draft_preview` · 5993 ms bei 196 Antworten. 64 Antworten mit mindestens einem Muster. 0 unbeantwortete Fälle außerhalb der vorgesehenen Ausnahmen und 43 bewusst stille Eingänge. Identitätsfragen bei bekannten Patienten 0 unter 143 ausgewerteten bekannten Fällen.
- `approved` · 4061.5 ms bei 200 Antworten. 82 Antworten mit mindestens einem Muster. 0 unbeantwortete Fälle außerhalb der vorgesehenen Ausnahmen und 39 bewusst stille Eingänge. Identitätsfragen bei bekannten Patienten 0 unter 143 ausgewerteten bekannten Fällen.

## Ersatzantworten und feste Vergleichsgruppe

Die Vergleichsgruppe sind die 144 Fälle mit Antworttext im Entwurfslauf vom 23.11. Beide Wissensstände werden anhand derselben Referenzen bewertet. Die gesamte Stichprobe umfasst je 239 Eingänge. Technische Ersatzantworten und Übergaben nach einem harten Sicherheitsbefund werden getrennt gezählt.

| Wissensstand | Vorher / 144 | Vorher / 239 | Jetzt technisch / 144 | Jetzt technisch / 239 | Harte Übergaben / 239 | Alte Muster / 144 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| draft_preview | 17 | 36 | 0 | 0 | 5 | 54 |
| approved | 12 | 28 | 0 | 0 | 2 | 69 |

Einschließlich der sicheren Antworten nach einem harten Sicherheitsbefund gab es in der Vergleichsgruppe je **2 von 144 (1,39 %)**. Über alle 239 Eingänge waren es **5 von 239 (2,09 %)** mit Entwurfswissen und **2 von 239 (0,84 %)** mit freigegebenem Wissen. Das Sprachziel von weniger als 30 markierten Fällen wurde verfehlt. Die Zweitbewertung markierte vor allem die formelhafte Fristansage und Übergaben mit wenig direkter Hilfe.

### Einzelbefunde des vorherigen Laufs

Pro Referenz ist der letzte protokollierte Ablehnungsgrund angegeben. Für frühere Entwürfe ohne eigenen Prüfbeleg sind keine Gründe ableitbar. Mit † markierte Fälle gehören zur 144er-Vergleichsgruppe.

**draft_preview**

- A03 · emoji
- A05 · model_timeout (compose)
- A06 · model_timeout (compose)
- A09 · model_timeout (compose)
- A10 · missing_direct_help
- A20 · model_timeout (compose)
- A35 † · vague_team_task, missing_direct_help
- A43 · booking
- A44 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- A55 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- A56 † · vague_team_task
- A72 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- A77 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- A80 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- A94 † · missing_direct_help
- A96 † · vague_team_task
- A97 † · vague_team_task, missing_direct_help
- B04 † · cold_tone
- B12 · emoji
- B13 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- B18 † · vague_team_task
- B22 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- B30 · vague_team_task
- B41 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- B48 † · vague_team_task
- B51 † · vague_team_task
- B53 † · vague_team_task
- B55 † · vague_team_task
- B62 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- B66 † · Die nötige Identitätsfrage mit dem konkreten Anliegen verbinden, ohne sie anzuhängen.
- B73 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- B82 † · vague_team_task, missing_direct_help
- B86 † · vague_team_task
- L01 † · salutation, Durchgängig die Anrede „du“ nutzen. Kein Wechsel zwischen du und Sie, auch nicht aus übernommenen Beispielen.
- L02 † · salutation, Durchgängig die Anrede „du“ nutzen. Kein Wechsel zwischen du und Sie, auch nicht aus übernommenen Beispielen.
- L12 † · vague_team_task

**approved**

- A03 · emoji
- A05 · model_timeout (compose)
- A06 · model_timeout (compose)
- A09 · model_timeout (compose)
- A10 · vague_team_task
- A15 † · vague_team_task
- A20 · model_timeout (compose)
- A29 † · vague_team_task
- A44 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- A45 † · vague_team_task
- A55 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- A69 † · vague_team_task
- A72 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- A80 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- A86 · invented_action
- A87 † · vague_team_task
- A88 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- B12 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- B15 † · vague_team_task
- B22 · Abschluss ohne bestätigte Einordnung oder leerer Entwurf
- B51 † · vague_team_task
- B55 † · Direkt sagen, was die Person tun kann oder was der Empfang konkret prüft. Keine Weitergabeformel und keine Systemgrenze beschreiben.
- B66 † · Die nötige Identitätsfrage mit dem konkreten Anliegen verbinden, ohne sie anzuhängen.
- B75 · emoji
- B88 † · booking, vague_team_task
- B91 · vague_team_task
- B96 † · vague_team_task
- L17 † · vague_team_task

### Gezielte Korrekturen

- B62 und B22: Leere oder nicht bestätigte Abschlussentwürfe galten als fehlende inhaltliche Hilfe. Eindeutige Ankunftsbestätigungen gehen jetzt direkt in die Abschlusslogik.
- B18: Vage Übergabe, obwohl der Patient nur die Abholung bestätigte. Die Abschlusslogik verhindert die Aufgabe.
- A97: Vage Aufgabe und fehlende direkte Hilfe. Die Antwort soll die belegte Uhrzeit nennen oder konkret prüfen lassen. Diese Texthinweise blockieren keinen sachlich sicheren Entwurf mehr.
- A94: Fehlende direkte Hilfe beim kurzen Zeitbezug. Der vorherige Gesprächsgegenstand darf ausgewertet werden, eine unbestätigte Uhrzeit bleibt offen.
- A77: Leerer oder nicht bestätigter Abschlussentwurf. Eine angekündigte Überweisung nach geklärter Frage wird als Abschluss behandelt.

### Ersatzantworten und harte Übergaben im neuen Lauf

**draft_preview**

- A25 · booking
- A43 · booking
- B13 · booking
- B59 · invented_action
- L21 · clinical_or_record_mismatch

**approved**

- B57 · invented_action
- L02 · clinical_or_record_mismatch

### Neue Ergebnisse der genannten Fälle

- **draft_preview/B62** · conversation:acknowledged · Super, dann bis Mittwoch um 14:15 Uhr!
- **approved/B62** · conversation:acknowledged · Super, dann bis Mittwoch um 14:15 Uhr!
- **draft_preview/B22** · conversation:acknowledged · Alles klar, danke für die Rückmeldung!
- **approved/B22** · conversation:acknowledged · Alles klar, danke für die Rückmeldung!
- **draft_preview/B18** · conversation:acknowledged · Alles klar, danke für die Rückmeldung!
- **approved/B18** · conversation:acknowledged · Alles klar, danke für die Rückmeldung!
- **draft_preview/A97** · retrieval:answered · Die genaue Uhrzeit für Montag ist mir hier noch nicht bekannt. Das Praxisteam prüft, welche Zeit am Montag [Person] ist, und nennt Ihnen die passende Uhrzeit. Sie hören heute bis 17 Uhr von uns.
- **approved/A97** · retrieval:answered · Die genaue Uhrzeit für Ihren Montagstermin ist mir hier nicht bekannt. Das Praxisteam prüft, welche Uhrzeit am Montag für Sie [Person] ist, und nennt Ihnen diese. Bei Schmerzen oder Beschwerden bis dahin erreichen Sie die [Person] telefonisch unter [Telefon]. Sie hören heute bis 17 Uhr von uns.
- **draft_preview/A94** · retrieval:answered · Heute ist Donnerstag, und 15 Uhr liegt innerhalb unserer Sprechzeiten. Das Praxisteam prüft, ob heute um 15 Uhr noch ein Termin [Person] ist. Für Ihre Abholung morgen gilt: Freitags ist die [Person] nur nach gesonderter Vereinbarung geöffnet, bitte stimmen Sie das vorher über den Chat ab. Sie hören heute bis 17 Uhr von uns.
- **approved/A94** · retrieval:answered · Das Praxisteam prüft, ob heute um 15 Uhr ein Termin [Person] ist. Ob es klappt, wird Ihnen dann mitgeteilt. Sie hören heute bis 17 Uhr von uns.
- **draft_preview/A77** · conversation:acknowledged · Alles klar, danke für die Rückmeldung!
- **approved/A77** · conversation:acknowledged · Alles klar, danke für die Rückmeldung!
- **draft_preview/A35** · billing:debit_and_appliance · Dass die Lastschrift eingezogen wurde, kann ich aus dem vorliegenden Stand noch nicht bestätigen. Zur Spangenkontrolle kann [Person] dienstags bis donnerstags während der Sprechzeiten spontan vorbeikommen. Bitte Wartezeit einplanen. Das Praxisteam prüft, ob die Lastschrift erneut eingezogen wird. Sie hören am Dienstag, 21. [Person] bis 10 Uhr von uns.
- **approved/A35** · billing:debit_and_appliance · Dass die Lastschrift eingezogen wurde, kann ich aus dem vorliegenden Stand noch nicht bestätigen. Zur Spangenkontrolle kann [Person] dienstags bis donnerstags während der Sprechzeiten spontan vorbeikommen. Bitte Wartezeit einplanen. Das Praxisteam prüft, ob die Lastschrift erneut eingezogen wird. Sie hören am Dienstag, 21. [Person] bis 10 Uhr von uns.
- **draft_preview/B48** · care:clarify_prior_statement · Das ist verständlich, wenn Sie dazu zwei unterschiedliche Aussagen bekommen haben. Das Praxisteam klärt mit der Behandlerin, was bei der letzten Untersuchung besprochen wurde. Sie hören heute bis 17 Uhr von uns.
- **approved/B48** · care:clarify_prior_statement · Das ist verständlich, wenn Sie dazu zwei unterschiedliche Aussagen bekommen haben. Das Praxisteam klärt mit der Behandlerin, was bei der letzten Untersuchung besprochen wurde. Sie hören heute bis 17 Uhr von uns.

## Zwei offene Praxisfälle

- **07:50 Uhr · `f75607c7-a478-4d1a-a2f4-b10053643166`**. Der Versand ist belegt. Die Telefonnummer war zugeordnet, die Identität noch unbestätigt. Die Doctolib-Bestätigung war nicht prüfbar. Die Rezeption muss die Buchung abgleichen.
- **08:16 Uhr · letzter Eingang `62cf9186-c0cd-4623-acca-fc617b20039e`**. Zwei Entwürfe wurden durch weitere Nachrichten ersetzt. Der leere, nicht unterstützte Eingang war ein eigener Eintrag. Der letzte Entwurf scheiterte an der Antwortprüfung. Es ging nichts raus. Der Fall bleibt bei der Praxis.

Fünf vorhandene Antwortbelege wurden anhand von Mandant und WhatsApp-ID mit der richtigen Eintrags-ID verknüpft. Zwei davon gehören zu versendeten Antworten. Beim leeren Eingang fehlt ein historischer Antwortbeleg.

## Modellkosten

Beträge in USD. Für ältere Aufrufe ohne Einzelpreis wurden gemessene Eingabe- und Ausgabetokens zum anhand echter Gateway-Belege geprüften EU-Tarif bewertet. Thinking ist in der SDK-Ausgabetokenzahl enthalten. Fehlende Preisbelege und nicht erfasste abgebrochene Aufrufe können den Rechnungsbetrag erhöhen. Die Redaktion und Zweitbewertung sind separat gekennzeichnet.

| Wissensstand | Erfassung aller Versuche | Ohne Preisbeleg | Zusätzliche Durchläufe über denselben Fall | Hochrechnung je 30 Tage |
| --- | ---: | ---: | ---: | ---: |
| draft_preview | 0.4399 | 0 | 30 | 0.7668 |
| approved | 0.3312 | 1 | 30 | 0.5673 |

Hochrechnung für 13 Antworten pro Tag anhand der letzten Ausführung je Fall. Die Hochrechnung enthält keine Annahme über künftige Cache-Treffer.

## Technische Fehler

Keine terminalen technischen Fehler. Wiederholte und erfolgreich beendete Fehler stehen je Fall im JSON.

## Alte Muster und Korrekturansätze

### generic_handoff

Konkrete Hilfe fehlt vor der Übergabe. Die Antwort zuerst auf das lösbare Anliegen und danach auf die echte Aufgabe fürs Team prüfen.

- `draft_preview` · A25, A29, A75, A93, A99, B21, B25, B27, B48, B51, B59, B82, B96, L03, L05
- `approved` · A08, A15, A18, A27, A29, A56, A63, A86, A93, A97, B15, B19, B20, B21, B25, B31, B45, B48, B51, B52, B53, B57, B58, B61, B68, B93, L01, L02, L21, L22, L23, L24, L27

### generic_patient_question

Die Identitätsfrage ist losgelöst vom Anliegen. An den konkreten Fall binden und Vorwissen nutzen.

- `draft_preview` · A10, A24, A44, A55, A68, A72, A80, B10, B35, B41, B43, B63, B70, B100, L07
- `approved` · A10, A24, A44, A48, A55, A80, A89, A99, B12, B13, B41, B59, B66, B70, B77, B100

### portal_access_boilerplate

Eine Systemgrenze wird ohne Hilfestellung beschrieben. Den echten Zugriffspfad oder den konkreten nächsten Schritt nennen.

- `draft_preview` · A74, A98, B29, B58, B85, L05, L10, L16
- `approved` · A56, A83, A98, B29, B82, L25

### reply_time_boilerplate

Die Rückmeldezeit ist ein Standardsatz. Angeben, was das Team bis dahin tatsächlich klärt.

- `draft_preview` · A25, A27, A29, A35, A70, A74, A75, A87, A92, A93, A94, A97, A99, B13, B19, B25, B27, B29, B31, B46, B47, B48, B49, B51, B52, B55, B56, B57, B58, B59, B61, B82, B94, B96, L03, L05, L08, L09, L12, L13, L14, L17, L21, L22
- `approved` · A12, A13, A17, A18, A19, A26, A27, A29, A35, A36, A45, A56, A59, A63, A69, A70, A72, A74, A75, A81, A83, A86, A88, A93, A94, A97, A98, A99, B15, B17, B19, B20, B21, B25, B40, B45, B47, B48, B53, B57, B58, B60, B61, B66, B68, B82, B84, B94, L01, L02, L07, L08, L09, L12, L21, L22, L23, L25, L30


## Zehn stärkste Antworten

**approved/B01 · 9/10**

Eingang

> Morgen 16 Uhr ist leider nicht möglich. Unter was buche ich für [Person] ein Termin? MB Kontrolle würde ich schätzen? Dann buche ich über Doctolib einen Termin - ich hatte schon wieder vergessen das [Person] dort Termine buchen kann. Ich bitte dies zu entschuldigen.

Antwort

> Kein Problem, Sie müssen sich nicht entschuldigen. Bitte wählen Sie bei Doctolib die Terminart „MB-Kontrolle“ für [Person]. Wenn Sie morgen um 16 Uhr nicht können, suchen Sie sich dort einfach einen anderen freien Termin aus.

**approved/B08 · 9/10**

Eingang

> Vielen Dank für die Nachricht. Kann ich den Termin einfach über Doctolib buchen? Wenn ja, wähle ich dort "Besprechung (Bestandspatienten)" aus?
> [Person] Grüße [Person]

Antwort

> Ja, Sie können den Termin über den Doctolib-Buchungslink der [Person] buchen: [Link] Wählen Sie dort "Besprechung (Bestandspatienten)" aus, das passt für Ihren Fall.

**approved/B95 · 9/10**

Eingang

> Guten Morgen,der Draht sticht [Person] leider innen alles auf. Ich habe Ihnen mal ein Bild gemacht. Denke da müsste dringend doch was gemacht werden weil er schon starke Schmerzen hat. Wann können wir vorbeikommen? [Person] Grüße [Person]

Antwort

> Bitte rufen Sie sofort in der [Person] an: [Telefon]. Bei Atemnot, starker Blutung oder Bewusstlosigkeit wählen Sie die 112.

**approved/L10 · 9/10**

Eingang

> Hallo, ich habe die Benachrichtigung erhalten, dass die aufgeschlüsselt Rechnung in der App verfügbar ist. Dort habe ich auch die Benachrichtigung, die Rechnung ist aber nicht hinterlegt

Antwort

> Sie müssen keine App installieren: Öffnen Sie animacura.io im Browser und melden Sie sich für den Bereich „Rechnungen“ an. Wenn der Versand per E-Mail freigegeben ist, kann die Rechnung auch an Ihre hinterlegte E-Mail-Adresse kommen.

**approved/L16 · 9/10**

Eingang

> Irgendwie kann ich die Rechnungen in der App nicht öffnen

Antwort

> Du musst keine App installieren: Öffne animacura.io im Browser und melde dich für den Bereich „Rechnungen“ an. Wenn der Versand per E-Mail freigegeben ist, kann die Rechnung auch an deine hinterlegte E-Mail-Adresse kommen.

**draft_preview/A01 · 9/10**

Eingang

> [Person] kfo Team, aufgrund von schienenersatzverkehr kommt [Person]. [Person] erst 17:06 bzw 18:06 am bhf an und verspäten sich dadurch um wenige Minuten. Ich bitte um Verständnis. Vg [Person]

Antwort

> Vielen Dank für die Information zur Verspätung durch den Schienenersatzverkehr. Bei einer Verspätung von wenigen Minuten ist das kein Problem, kommen Sie einfach zu Ihrem Termin. Sollte sich die Verspätung auf mehr als 15 Minuten ausweiten, geben Sie dem Praxisteam bitte [Person] Bescheid, dann klärt es, ob der Termin heute noch stattfinden kann.

**draft_preview/A19 · 9/10**

Eingang

> Hallo,
> ich habe heute um 15:30 Uhr einen Termin. Leider hat meine Bahn Ausfall und Verspätung, daher kann es sein, dass ich etwa 10 Minuten später komme.
> MfG [Person]

Antwort

> Vielen Dank für die Info. Bei etwa 10 Minuten Verspätung kommen Sie einfach zu Ihrem Termin um 15:30 Uhr, eventuell mit etwas Wartezeit. Sollte es doch länger als 15 Minuten dauern, rufen Sie bitte [Person] unter [Telefon] an, dann entscheidet das Team, ob der Termin heute noch klappt.

**draft_preview/A37 · 9/10**

Eingang

> Guten Tag ich habe bei meiner unterem Zahnspange Probleme und kann jetzt nicht mehr zubeißen kann ich zu ihnen kommen?

Antwort

> Guten Tag, das tut mir leid, dass Sie so eingeschränkt sind. Ja, Sie können zu uns kommen: Während der Sprechzeiten von Dienstag bis Donnerstag können Sie spontan vorbeikommen, dann mit etwas Wartezeit, oder Sie buchen einen festen Termin unter [Link] Bitte bringen Sie die Spange mit. Hat sich etwas gelöst oder drückt etwas, oder haben Sie starke Schmerzen? Dann rufen Sie uns bitte direkt an unter [Telefon].

**draft_preview/A83 · 9/10**

Eingang

> Noch eine Bitte,  können Sie mir letzte Rechnung von [Person] mir schicken per watzap . Per Post es ist noch nicht angekommen.

Antwort

> Das tut mir leid, dass die Rechnung per Post noch nicht angekommen ist. Rechnungen versende ich über diesen Chat nicht, und eine Zustellung per [Person] kann ich Ihnen nicht zusagen. Sie finden Ihre Rechnungen im Patientenportal unter animacura.io, im Browser und ohne App, im Bereich „Rechnungen“, sofern Ihr Zugang freigeschaltet ist. Das Praxisteam prüft, ob die letzte Rechnung vorliegt und wie sie Ihnen zugestellt werden kann. Sie hören heute bis 17 Uhr von uns.

**draft_preview/A96 · 9/10**

Eingang

> Guten Morgen
> Ich habe gestern am späten Abend per Mail ein Anhang bekommen wegen den Rechnungen von Einsehen was hat das da auf sich das Geld kommt da aber jetzt nicht aufs Konto richtig.
> L.G. [Person]

Antwort

> Guten Morgen [Person] , Rechnungen, Zahlungen und Dokumente finden Sie im Patientenportal unter animacura.io, das Sie im Browser ohne App öffnen. Dort sehen Sie unter „Rechnungen“ den Stand, den Zugang erhalten Sie mit Patientennummer, Geburtsdatum und hinterlegter E-Mail, den Code bekommen Sie per E-Mail. Passwort oder Code geben Sie bitte nie an die [Person] weiter. Ob die Zahlung bei uns eingegangen ist, prüft das Praxisteam und meldet sich mit dem Stand. Sie hören heute bis 12 Uhr von uns.


## Zehn schwächste Antworten

**approved/B57 · 1/10**

Eingang

> Ja die brauch er dann für die Schule . Dann sind wir am 29.9 um 9 uhr da . Soll ich irgendwas bestimmtes mitbringen?

Antwort

> Das Praxisteam prüft, welche Uhrzeit für den Termin eingetragen ist. Sie hören am Montag, 21. September bis 10 Uhr von uns.

**draft_preview/A24 · 1/10**

Eingang

> [Person] Team wir stecken im Berufsverkehr, wir versuchen in 5-10 Minuten da zu sein. [Person] Grüße [Person]

Antwort

> Was genau soll ich für Sie klären?

**approved/A24 · 1/10**

Eingang

> [Person] Team wir stecken im Berufsverkehr, wir versuchen in 5-10 Minuten da zu sein. [Person] Grüße [Person]

Antwort

> Was genau soll ich für Sie klären?

**draft_preview/B59 · 2/10**

Eingang

> We coming now

Antwort

> Das Praxisteam prüft, welche Uhrzeit für den Termin eingetragen ist. Sie hören am Freitag, 6. November bis 10 Uhr von uns.

**draft_preview/A25 · 2/10**

Eingang

> Hallo. Heute um 18:30 ist in Ordnung. Vielen Dank

Antwort

> Das Praxisteam liest im Chat nach, welcher [Person] noch offen ist. Sie hören heute bis 17 Uhr von uns.

**approved/L22 · 2/10**

Eingang

> Es wurde noch keine Uhrzeit vereinbart

Antwort

> Die Uhrzeit für Ihren Termin am Montag wurde noch nicht vereinbart. Das Praxisteam klärt, welche Uhrzeit für Sie möglich ist, und meldet sich dafür bei Ihnen. Sie hören am Montag, 23. November bis 10 Uhr von uns.

**approved/L21 · 2/10**

Eingang

> [Person] Praxisteam, ich wollte mich nochmal erkundigen wegen des Termins morgen. Wann soll ich da sein?

Antwort

> Das Praxisteam prüft die genaue Uhrzeit Ihres Termins am Montag und nennt Ihnen die Uhrzeit. Bitte haben Sie etwas Geduld, bis die Rückmeldung bei Ihnen eingeht. Sie hören am Montag, 23. November bis 10 Uhr von uns.

**approved/L02 · 2/10**

Eingang

> Hallo, bei mir ist ein Attachment abgegangen. Kann ich spontan in der [Person] vorbeikommen?

Antwort

> Das Praxisteam prüft, welche Uhrzeit für den Termin eingetragen ist. Du hörst am Montag, 23. November bis 10 Uhr von uns.

**draft_preview/L17 · 2/10**

Eingang

> Ja das hab ich schon verstanden aber ich versuche es ja gerade unter Rechnungen zu öffnen aber da kommt eine Fehlermeldung

Antwort

> Das ist ärgerlich, dass beim Öffnen der Rechnungen eine Fehlermeldung kommt. Bitte lass dir im Portal unter „Rechnungen“ nichts anderes anzeigen als den Fehler; einen Code oder dein Passwort musst du der [Person] nicht schicken. Das Praxisteam prüft, woran es hakt, und meldet sich am Montag, 23. November, bei dir. Du hörst am Montag, 23. November bis 10 Uhr von uns.

**draft_preview/A80 · 2/10**

Eingang

> Ich danke Ihnen und ich werde mich so [Person] wie möglich dort melden.  Mit freundlichen Grüße [Person]

Antwort

> Was genau soll ich für Sie klären?
