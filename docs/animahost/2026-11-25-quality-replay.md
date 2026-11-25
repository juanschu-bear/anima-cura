# AnimaHost – Qualitätsvergleich 2026-11-25

20 echte Chats, 25 historische Eingänge vom 2026-11-23 bis 2026-11-25. Kein Versand, keine Speicherung von Entscheidungen oder Praxisaufgaben. Private Eingaben und Antworttexte liegen außerhalb des Repositories.

Die Historie endet jeweils vor dem Eingang; spätere Nachrichten werden nicht als Kontext verwendet. Patientenblatt und Wissensbasis werden beim Lauf lesend geladen und sind kein historischer Datenbank-Snapshot. Wiederholungen werden gegen tatsächlich vorhandene historische AnimaHost-Antworten geprüft, nicht gegen simulierte Antworten des vorigen Testfalls.

Hinterlegte Buchungsadresse: https://www.doctolib.de/kieferorthopadie/leipzig/maria-elena-schubert

| Prüfung | Vorher | Nachher |
|---|---:|---:|
| Antworten | 24 | 25 |
| Zurückgehalten / Fehler | 1 | 0 |
| Antworten mit erkannten Wiederholungen | 11 | 0 |
| Antworten mit verbotenen Satzbausteinen | 0 | 0 |
| Eingänge mit fehlenden passenden Regeln im Kontext | 14 | 0 |
| Antworten mit JSON / internen Feldern | 0 | 0 |
| Antworten mit hinterlegtem Buchungslink | 1 | 5 |

Ein zurückgehaltener Entwurf ist kein technischer Fehler. Regelverwendung stammt aus dem Prüfschritt; bereitgestellte Regeln allein belegen noch keine Verwendung. „configured“ bezeichnet ausschließlich die unten genannte hinterlegte Adresse.

Eingabe-SHA256: `f598ca4ae7c6b52f9c4dcf6e9c04ea96262e280a38082ff187a6027e603999de`

## Vorher

Systemtext/Core-SHA256: `50711cd961d1791f984a714acfba2e7f1b880978ddc183f53c6061ccb6fd866d`; Laufbeginn: 2026-11-25T07:27:04.431Z.

`{"turns":25,"answered":24,"errors":1,"structuredReplies":0,"repeatedReplies":11,"forbiddenReplies":0,"missingRuleReplies":14,"referralFalsePositives":0,"configuredLinks":1}`

| Fall | Eingang (Berlin) | Antwort | Wiederholungen | Verbotene Sätze | Passende Regeln | Regeln im Kontext | Genutzte Regeln laut Prüfer | Link | Team |
|---|---|---|---|---|---|---|---|---|---|
| C01-1 | 25.11.26, 07:12:21 | ja | – | – | termin-absagen, termin-verschieben | – | nicht ausgewiesen | – | – |
| C01-2 | 25.11.26, 07:15:16 | ja | emergency_112, deadline | – | dank-und-lob | – | nicht ausgewiesen | – | – |
| C02-3 | 24.11.26, 16:21:24 | ja | – | – | – | – | nicht ausgewiesen | – | – |
| C02-4 | 24.11.26, 16:25:22 | ja | – | – | – | – | nicht ausgewiesen | – | – |
| C03-5 | 24.11.26, 15:01:07 | ja | – | – | – | – | nicht ausgewiesen | – | – |
| C03-6 | 24.11.26, 16:29:05 | ja | deadline | – | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | – | nicht ausgewiesen | – | – |
| C03-7 | 24.11.26, 16:29:52 | ja | deadline | – | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | – | nicht ausgewiesen | – | – |
| C03-8 | 24.11.26, 17:38:15 | ja | deadline | – | – | – | nicht ausgewiesen | – | – |
| C04-9 | 24.11.26, 14:22:13 | ja | deadline | – | – | – | nicht ausgewiesen | – | – |
| C05-10 | 23.11.26, 12:42:44 | ja | – | – | dank-und-lob, termin-besprechung | – | nicht ausgewiesen | – | – |
| C06-11 | 23.11.26, 12:05:21 | ja | – | – | was-kostet-die-behandlung | – | nicht ausgewiesen | – | – |
| C07-12 | 24.11.26, 17:00:25 | ja | – | – | wo-finde-ich-meine-rechnung, rechnung-bei-versicherung-oder-beihilfe-einreich | – | nicht ausgewiesen | – | – |
| C08-13 | 24.11.26, 19:31:11 | ja | deadline | – | – | – | nicht ausgewiesen | – | – |
| C09-14 | 24.11.26, 16:08:09 | ja | – | – | wo-finde-ich-meine-rechnung | – | nicht ausgewiesen | – | – |
| C10-15 | 24.11.26, 15:18:45 | ja | – | – | termin-absagen | – | nicht ausgewiesen | – | – |
| C11-16 | 24.11.26, 14:28:44 | ja | deadline | – | wo-finde-ich-meine-rechnung, zahlung-ist-erledigt | – | nicht ausgewiesen | – | – |
| C12-17 | 24.11.26, 12:04:22 | ja | deadline | – | – | – | nicht ausgewiesen | – | – |
| C13-18 | 24.11.26, 09:35:55 | guard_rejected | – | – | wo-finde-ich-meine-rechnung, erstattung-durch-krankenkasse-oder-versicherung, spontan-vorbeikommen, guthaben-zurueckueberweisen | – | nicht ausgewiesen | – | – |
| C14-19 | 24.11.26, 08:17:39 | ja | – | – | etwas-in-der-praxis-vergessen | – | nicht ausgewiesen | – | – |
| C15-20 | 24.11.26, 07:50:19 | ja | – | – | – | – | nicht ausgewiesen | – | – |
| C16-21 | 23.11.26, 15:52:23 | ja | deadline | – | termin-verschieben | – | nicht ausgewiesen | – | – |
| C17-22 | 23.11.26, 09:28:30 | ja | – | – | dank-und-lob | – | nicht ausgewiesen | – | – |
| C18-23 | 23.11.26, 11:23:18 | ja | deadline | – | – | – | nicht ausgewiesen | – | – |
| C19-24 | 23.11.26, 13:47:04 | ja | – | – | – | – | nicht ausgewiesen | configured | – |
| C20-25 | 23.11.26, 13:10:17 | ja | deadline | – | – | – | nicht ausgewiesen | – | – |
Gezielte Nachprüfungen zurückgehaltener Entwürfe nach Codekorrektur: C03-7 (2026-11-25T07:53:51.910Z), C13-18 (2026-11-25T07:53:51.917Z). Die übrigen Antworten stammen aus dem vollständigen Lauf mit unverändertem Systemtext.

## Nachher

Systemtext/Core-SHA256: `c4eb5f9bab592373572fb9b4d78fd9f601aa622b4a249f1bde27e78a642ae396`; Laufbeginn: 2026-11-25T07:50:47.511Z.

`{"turns":25,"answered":25,"errors":0,"structuredReplies":0,"repeatedReplies":0,"forbiddenReplies":0,"missingRuleReplies":0,"referralFalsePositives":0,"configuredLinks":5}`

| Fall | Eingang (Berlin) | Antwort | Wiederholungen | Verbotene Sätze | Passende Regeln | Regeln im Kontext | Genutzte Regeln laut Prüfer | Link | Team |
|---|---|---|---|---|---|---|---|---|---|
| C01-1 | 25.11.26, 07:12:21 | ja | – | – | termin-absagen, termin-verschieben | termin-absagen, termin-verschieben | termin-verschieben | configured | info |
| C01-2 | 25.11.26, 07:15:16 | ja | – | – | dank-und-lob | dank-und-lob | dank-und-lob | – | act |
| C02-3 | 24.11.26, 16:21:24 | ja | – | – | – | – | nicht ausgewiesen | – | – |
| C02-4 | 24.11.26, 16:25:22 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C03-5 | 24.11.26, 15:01:07 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C03-6 | 24.11.26, 16:29:05 | ja | – | – | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | erstattung-durch-krankenkasse-oder-versicherung | – | act |
| C03-7 | 24.11.26, 16:29:52 | ja | – | – | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | nicht ausgewiesen | – | act |
| C03-8 | 24.11.26, 17:38:15 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C04-9 | 24.11.26, 14:22:13 | ja | – | – | – | – | nicht ausgewiesen | – | act |
| C05-10 | 23.11.26, 12:42:44 | ja | – | – | dank-und-lob, termin-besprechung | dank-und-lob, termin-besprechung | termin-besprechung | – | act |
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
| C19-24 | 23.11.26, 13:47:04 | ja | – | – | – | – | nicht ausgewiesen | configured | – |
| C20-25 | 23.11.26, 13:10:17 | ja | – | – | – | – | nicht ausgewiesen | – | act |

## Einordnung und Prüfung

- C01 enthält die angeforderten Eingänge vom 25.11. um 07:12:21 und 07:15:16 (Berlin); C02 und C03 die angeforderten Gesprächsfolgen vom 24.11.
- C01, C10 und die Namens-Folgeantwort C16 verwenden die passende Terminregel und werden mit teamKind=info ausgegeben. Buchungsadressen werden ausschließlich aus der hinterlegten Konfiguration eingesetzt.
- Die beiden zurückgehaltenen Nachher-Entwürfe C03-7 und C13-18 wurden nach einer eng begrenzten Korrektur für angekündigte Zuordnungs-/Berechtigungsprüfungen erneut gerechnet. Eine Prüfung anzukündigen bestätigt weder die Zuordnung noch eine Freigabe. Die Nachprüfungen sind oben protokolliert.
- Die Satztrennung berücksichtigt ausgeschriebene Datumsangaben, damit beim Entfernen einer Frist keine Monats-/Uhrzeitreste verbleiben. Ein versehentlich ausgegebener JSON-Umschlag wird vor der Prüfung auf den Patientenwortlaut reduziert.
- Der Nachher-Stand enthält außerdem die parallel auf main veröffentlichten Formulierungsänderungen bis c1f1549. Der Vergleich misst den zusammengeführten Stand, keine isolierte Wirkung einzelner Änderungen.
- Wiederholungszahlen beziehen sich auf feste Kategorien und exakte Satzwiederholungen; zusätzliche sinngemäße Wiederholungen prüft das Modell. Die Nullwerte sind das Ergebnis dieser Stichprobe, keine Garantie für alle künftigen Modellantworten. Verbotene Satzbausteine bezeichnet die explizite Liste „Du sagst nie“ des Systemtexts.
- 163 AnimaHost-Regressionstests, 4 Tests für Praxisneuigkeiten und Typprüfung bestanden. Keine Datenbankmigration und keine Veröffentlichung der vorbereiteten Praxisneuigkeit.
