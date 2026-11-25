# AnimaHost – Qualitätsvergleich 2026-11-25

20 echte Chats, 25 historische Eingänge vom 2026-11-23 bis 2026-11-25. Kein Versand, keine Speicherung von Entscheidungen oder Praxisaufgaben. Private Eingaben und Antworttexte liegen außerhalb des Repositories.

Die Historie endet jeweils vor dem Eingang; spätere Nachrichten werden nicht als Kontext verwendet. Patientenblatt und Wissensbasis werden beim Lauf lesend geladen und sind kein historischer Datenbank-Snapshot. Wiederholungen werden gegen tatsächlich vorhandene historische AnimaHost-Antworten geprüft, nicht gegen simulierte Antworten des vorigen Testfalls.

Hinterlegte Buchungsadresse: https://www.doctolib.de/kieferorthopadie/leipzig/maria-elena-schubert

| Prüfung | Vorher | Nachher |
|---|---:|---:|
| Antworten | 25 | 24 |
| Zurückgehalten / Fehler | 0 | 1 |
| Antworten mit erkannten Wiederholungen | 0 | 0 |
| Antworten mit verbotenen Satzbausteinen | 0 | 0 |
| Eingänge mit fehlenden passenden Regeln im Kontext | 0 | 0 |
| Antworten mit JSON / internen Feldern | 0 | 0 |
| Antworten mit hinterlegtem Buchungslink | 5 | 4 |

Ein zurückgehaltener Entwurf ist kein technischer Fehler. Regelverwendung stammt aus dem Prüfschritt; bereitgestellte Regeln allein belegen noch keine Verwendung. „configured“ bezeichnet ausschließlich die unten genannte hinterlegte Adresse.

Eingabe-SHA256: `f598ca4ae7c6b52f9c4dcf6e9c04ea96262e280a38082ff187a6027e603999de`

## Vorher

Systemtext/Core-SHA256: `c4eb5f9bab592373572fb9b4d78fd9f601aa622b4a249f1bde27e78a642ae396`; Laufbeginn: 2026-11-25T08:07:13.237Z.

`{"turns":25,"answered":25,"errors":0,"structuredReplies":0,"repeatedReplies":0,"forbiddenReplies":0,"missingRuleReplies":0,"referralFalsePositives":0,"configuredLinks":5}`

| Fall | Eingang (Berlin) | Antwort | Wiederholungen | Verbotene Sätze | Passende Regeln | Regeln im Kontext | Genutzte Regeln laut Prüfer | Link | Team |
|---|---|---|---|---|---|---|---|---|---|
| C01-1 | 25.11.26, 07:12:21 | ja | – | – | termin-absagen, termin-verschieben | termin-absagen, termin-verschieben | termin-verschieben | configured | info |
| C01-2 | 25.11.26, 07:15:16 | ja | – | – | dank-und-lob | dank-und-lob | nicht ausgewiesen | – | – |
| C02-3 | 24.11.26, 16:21:24 | ja | – | – | – | – | nicht ausgewiesen | – | – |
| C02-4 | 24.11.26, 16:25:22 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C03-5 | 24.11.26, 15:01:07 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C03-6 | 24.11.26, 16:29:05 | ja | – | – | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | nicht ausgewiesen | – | act |
| C03-7 | 24.11.26, 16:29:52 | ja | – | – | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | nicht ausgewiesen | – | act |
| C03-8 | 24.11.26, 17:38:15 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C04-9 | 24.11.26, 14:22:13 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C05-10 | 23.11.26, 12:42:44 | ja | – | – | dank-und-lob, termin-besprechung | dank-und-lob, termin-besprechung | nicht ausgewiesen | configured | act |
| C06-11 | 23.11.26, 12:05:21 | ja | – | – | was-kostet-die-behandlung | was-kostet-die-behandlung | was-kostet-die-behandlung | – | act |
| C07-12 | 24.11.26, 17:00:25 | ja | – | – | wo-finde-ich-meine-rechnung, rechnung-bei-versicherung-oder-beihilfe-einreich | wo-finde-ich-meine-rechnung, rechnung-bei-versicherung-oder-beihilfe-einreich | wo-finde-ich-meine-rechnung, rechnung-bei-versicherung-oder-beihilfe-einreich | animacura.io | act |
| C08-13 | 24.11.26, 19:31:11 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C09-14 | 24.11.26, 16:08:09 | ja | – | – | wo-finde-ich-meine-rechnung | wo-finde-ich-meine-rechnung | nicht ausgewiesen | – | act |
| C10-15 | 24.11.26, 15:18:45 | ja | – | – | termin-absagen | termin-absagen | termin-absagen | configured | info |
| C11-16 | 24.11.26, 14:28:44 | ja | – | – | wo-finde-ich-meine-rechnung, zahlung-ist-erledigt | wo-finde-ich-meine-rechnung, zahlung-ist-erledigt | nicht ausgewiesen | – | act |
| C12-17 | 24.11.26, 12:04:22 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C13-18 | 24.11.26, 09:35:55 | ja | – | – | wo-finde-ich-meine-rechnung, erstattung-durch-krankenkasse-oder-versicherung, spontan-vorbeikommen, guthaben-zurueckueberweisen | wo-finde-ich-meine-rechnung, erstattung-durch-krankenkasse-oder-versicherung, spontan-vorbeikommen, guthaben-zurueckueberweisen | wo-finde-ich-meine-rechnung | – | act |
| C14-19 | 24.11.26, 08:17:39 | ja | – | – | etwas-in-der-praxis-vergessen | etwas-in-der-praxis-vergessen | nicht ausgewiesen | – | – |
| C15-20 | 24.11.26, 07:50:19 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C16-21 | 23.11.26, 15:52:23 | ja | – | – | termin-verschieben | termin-verschieben | termin-verschieben | configured | info |
| C17-22 | 23.11.26, 09:28:30 | ja | – | – | dank-und-lob | dank-und-lob | nicht ausgewiesen | configured | – |
| C18-23 | 23.11.26, 11:23:18 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C19-24 | 23.11.26, 13:47:04 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C20-25 | 23.11.26, 13:10:17 | ja | – | – | – | – | nicht ausgewiesen | – | – |
## Nachher

Systemtext/Core-SHA256: `d99beca2bc85b30c9815a100bbe2e1fa98d91f96c8f3f9c1e41ab66234fb9e86`; Laufbeginn: 2026-11-25T08:10:02.485Z.

`{"turns":25,"answered":24,"errors":1,"structuredReplies":0,"repeatedReplies":0,"forbiddenReplies":0,"missingRuleReplies":0,"referralFalsePositives":0,"configuredLinks":4}`

| Fall | Eingang (Berlin) | Antwort | Wiederholungen | Verbotene Sätze | Passende Regeln | Regeln im Kontext | Genutzte Regeln laut Prüfer | Link | Team |
|---|---|---|---|---|---|---|---|---|---|
| C01-1 | 25.11.26, 07:12:21 | ja | – | – | termin-absagen, termin-verschieben | termin-absagen, termin-verschieben | termin-verschieben | configured | info |
| C01-2 | 25.11.26, 07:15:16 | ja | – | – | dank-und-lob | dank-und-lob | nicht ausgewiesen | – | act |
| C02-3 | 24.11.26, 16:21:24 | ja | – | – | – | – | nicht ausgewiesen | – | – |
| C02-4 | 24.11.26, 16:25:22 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C03-5 | 24.11.26, 15:01:07 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C03-6 | 24.11.26, 16:29:05 | ja | – | – | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | erstattung-durch-krankenkasse-oder-versicherung | – | act |
| C03-7 | 24.11.26, 16:29:52 | ja | – | – | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | nicht ausgewiesen | – | act |
| C03-8 | 24.11.26, 17:38:15 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C04-9 | 24.11.26, 14:22:13 | guard_rejected | – | – | – | – | nicht ausgewiesen | – | – |
| C05-10 | 23.11.26, 12:42:44 | ja | – | – | dank-und-lob, termin-besprechung | dank-und-lob, termin-besprechung | termin-besprechung | – | act |
| C06-11 | 23.11.26, 12:05:21 | ja | – | – | was-kostet-die-behandlung | was-kostet-die-behandlung | was-kostet-die-behandlung | – | act |
| C07-12 | 24.11.26, 17:00:25 | ja | – | – | wo-finde-ich-meine-rechnung, rechnung-bei-versicherung-oder-beihilfe-einreich | wo-finde-ich-meine-rechnung, rechnung-bei-versicherung-oder-beihilfe-einreich | rechnung-bei-versicherung-oder-beihilfe-einreich | – | act |
| C08-13 | 24.11.26, 19:31:11 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C09-14 | 24.11.26, 16:08:09 | ja | – | – | wo-finde-ich-meine-rechnung | wo-finde-ich-meine-rechnung | nicht ausgewiesen | – | act |
| C10-15 | 24.11.26, 15:18:45 | ja | – | – | termin-absagen | termin-absagen | termin-absagen | configured | info |
| C11-16 | 24.11.26, 14:28:44 | ja | – | – | wo-finde-ich-meine-rechnung, zahlung-ist-erledigt | wo-finde-ich-meine-rechnung, zahlung-ist-erledigt | nicht ausgewiesen | – | act |
| C12-17 | 24.11.26, 12:04:22 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C13-18 | 24.11.26, 09:35:55 | ja | – | – | wo-finde-ich-meine-rechnung, erstattung-durch-krankenkasse-oder-versicherung, spontan-vorbeikommen, guthaben-zurueckueberweisen | wo-finde-ich-meine-rechnung, erstattung-durch-krankenkasse-oder-versicherung, spontan-vorbeikommen, guthaben-zurueckueberweisen | nicht ausgewiesen | – | act |
| C14-19 | 24.11.26, 08:17:39 | ja | – | – | etwas-in-der-praxis-vergessen | etwas-in-der-praxis-vergessen | nicht ausgewiesen | – | – |
| C15-20 | 24.11.26, 07:50:19 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C16-21 | 23.11.26, 15:52:23 | ja | – | – | termin-verschieben | termin-verschieben | termin-verschieben | configured | info |
| C17-22 | 23.11.26, 09:28:30 | ja | – | – | dank-und-lob | dank-und-lob | nicht ausgewiesen | – | – |
| C18-23 | 23.11.26, 11:23:18 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C19-24 | 23.11.26, 13:47:04 | ja | – | – | – | – | nicht ausgewiesen | configured | – |
| C20-25 | 23.11.26, 13:10:17 | ja | – | – | – | – | nicht ausgewiesen | – | act |

## Einordnung und Verspätungsfälle

Verglichen wurden Systemtext und Prüfanweisung aus `43113c5` mit `main` bei `5e5e0e3`. Der einzige Unterschied dieser Anweisungsquellen ist die von Juan freigegebene Verspätungsregel. Der Nachher-Hash bleibt beim Glockenumbau unverändert. Beide vollständigen Läufe hatten **null technische Fehler und null Versand**. C04-9 ist eine vom Guard zurückgehaltene Antwort, kein Transportfehler; der Lauf wurde nicht selektiv wiederholt, um das Ergebnis zu schönen.

**C02-3 und C02-4 sind die echten Verspätungsfälle.** Beide Eingänge enthalten keine konkrete Minutenzahl. Vorher fragt C02-3 nach der ungefähren Verspätung; C02-4 sagt dagegen pauschal, die Familie könne auch später nachkommen. Nachher fragen beide Antworten freundlich nach der ungefähren Minutenzahl. C02-4 bleibt eine Teamaufgabe. Es wird kein Buchungslink ausgegeben. Die Abfrage erfolgt im zweiten Eingang erneut, weil der Replay jeweils die tatsächlich gesendete historische Unterhaltung nutzt, nicht die simulierte Antwort des vorherigen Eingangs.

Die Schwellen „bis 15 Minuten“, „mehr als 15 Minuten“ und „lange Anfahrt als Ausnahme“ sind mit diesen beiden echten Eingängen **nicht separat belegt**. Der Test ist kein Nachweis für alle möglichen Verspätungsfälle.

Alle 50 Ergebnisse einschließlich Prüfschritten wurden privat gelesen. Automatisch erkannt: vorher/nachher jeweils keine Wiederholungen, verbotenen Satzbausteine oder fehlenden passenden Regeln im Kontext. Nachher 24 ausgegebene Antworten statt 25; C04-9 enthält nach zwei Versuchen nur `empty_model_output` und wird nicht versendet. Die Anzahl der Antworten mit hinterlegtem Buchungslink sinkt von fünf auf vier; Terminverschiebung/-absage C01-1, C10-15 und C16-21 behalten den richtigen Link und `teamKind=info`.

Weitere qualitative Grenzen: C01-2 wird nachher zusätzlich als Teamaufgabe eingestuft. C08-13 behandelt einen Platzhalter aus dem Kontext wie eine unvollständige Datumsangabe. C15-20 bestätigt einen aus dem Chat übernommenen Termin trotz fehlender Doctolib-Einsicht. C19-24 enthält zusätzliche Behandlungshinweise, die der Prüfer passieren lässt. Diese Beobachtungen sind kein fehlerfreies Gesamturteil; Systemtext und Prüfanweisung wurden in diesem Auftrag nicht zusätzlich verändert. Die Änderungen an der Glocke erzeugen keine Patientenantworten.

## Prüferhinweise während der Entwürfe

Die Nullwerte oben beziehen sich auf die automatisch untersuchten Endantworten. Die folgenden Hinweise wurden während der ersten oder zweiten Entwürfe erkannt; ein Hinweis im zweiten Versuch kann trotz Freigabe als weiche Qualitätsabweichung bestehen bleiben. Damit sind insbesondere keine pauschal fehlerfreien Antworten behauptet.

| Lauf | Fall | Versuch | Harte Gründe | Verbesserungen | Entfernte Wiederholungen |
|---|---|---:|---|---|---:|
| Vorher | C02-4 | 1 | – | repetition | 0 |
| Vorher | C03-6 | 1 | confidential_unconfirmed | – | 0 |
| Vorher | C04-9 | 1 | empty_model_output | – | 0 |
| Vorher | C06-11 | 1 | – | forbidden_sentence | 0 |
| Vorher | C07-12 | 1 | confidential_unconfirmed | invented_appointment_or_cost | 0 |
| Vorher | C08-13 | 1 | – | forbidden_sentence, identity_known | 0 |
| Vorher | C08-13 | 2 | – | identity_known, repetition | 1 |
| Vorher | C12-17 | 1 | – | repetition | 0 |
| Vorher | C18-23 | 1 | – | forbidden_sentence, repetition | 0 |
| Vorher | C18-23 | 2 | – | medical_advice, repetition | 1 |
| Vorher | C19-24 | 1 | – | identity_known | 0 |
| Vorher | C19-24 | 2 | – | identity_known, repetition | 1 |
| Nachher | C02-3 | 1 | – | forbidden_sentence | 0 |
| Nachher | C03-6 | 1 | – | repetition | 0 |
| Nachher | C03-7 | 1 | confidential_unconfirmed | – | 0 |
| Nachher | C03-7 | 2 | – | repetition | 1 |
| Nachher | C04-9 | 1 | empty_model_output | – | 0 |
| Nachher | C04-9 | 2 | empty_model_output | – | 0 |
| Nachher | C10-15 | 1 | – | invented_appointment_or_cost | 0 |
| Nachher | C11-16 | 1 | – | repetition | 0 |
| Nachher | C13-18 | 1 | – | forbidden_sentence, repetition | 0 |
| Nachher | C15-20 | 1 | – | repetition | 0 |
| Nachher | C15-20 | 2 | – | invented_appointment_or_cost | 0 |
| Nachher | C18-23 | 1 | – | forbidden_sentence, repetition | 0 |
| Nachher | C18-23 | 2 | – | identity_known | 0 |

## Manuelle Ergänzung zu verbotenen Formulierungen

Der automatische Endantwort-Zähler meldet jeweils null, die manuelle Durchsicht findet jedoch die im Systemtext verbotene Weiterleitungsformulierung in **je einer Endantwort**: vorher C03-5, nachher C01-2 (jeweils sinngemäß „Ich gebe … ans Team weiter“). Diese wurden vom Modellprüfer nicht beanstandet. Daher lautet das belastbare Ergebnis für diese manuell gefundenen verbotenen Formulierungen **1 vorher / 1 nachher**, nicht null. Die Tabellen oben geben unverändert die maschinelle Auswertung wieder. Eine Korrektur von Systemtext oder Prüfanweisung wurde nicht in diesen auf den freigegebenen main-Stand bezogenen Vergleich hineingemischt.
