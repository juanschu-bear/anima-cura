# AnimaHost – Qualitätsvergleich 2026-11-25

20 echte Chats, 25 historische Eingänge vom 2026-11-23 bis 2026-11-25. Kein Versand, keine Speicherung von Entscheidungen oder Praxisaufgaben. Private Eingaben und Antworttexte liegen außerhalb des Repositories.

Die Historie endet jeweils vor dem Eingang; spätere Nachrichten werden nicht als Kontext verwendet. Patientenblatt und Wissensbasis werden beim Lauf lesend geladen und sind kein historischer Datenbank-Snapshot. Wiederholungen werden gegen tatsächlich vorhandene historische AnimaHost-Antworten geprüft, nicht gegen simulierte Antworten des vorigen Testfalls.

Hinterlegte Buchungsadresse: https://www.doctolib.de/kieferorthopadie/leipzig/maria-elena-schubert

| Prüfung | Vorher | Nachher |
|---|---:|---:|
| Antworten | 22 | 24 |
| Zurückgehalten / Fehler | 3 | 1 |
| Antworten mit erkannten Wiederholungen | 0 | 0 |
| Antworten mit verbotenen Satzbausteinen | 0 | 0 |
| Eingänge mit fehlenden passenden Regeln im Kontext | 0 | 0 |
| Antworten mit JSON / internen Feldern | 0 | 0 |
| Antworten mit hinterlegtem Buchungslink | 4 | 4 |

Ein zurückgehaltener Entwurf ist kein technischer Fehler. Regelverwendung stammt aus dem Prüfschritt; bereitgestellte Regeln allein belegen noch keine Verwendung. „configured“ bezeichnet ausschließlich die unten genannte hinterlegte Adresse.

Eingabe-SHA256: `13900be413756d5a2240be323f7427312c183a0cecceec3eecac2d2b61e3a54a`

## Vorher

Systemtext/Core-SHA256: `e3ddaa87318e0b1c727ba58c5cf69accd4ca916dc42d464bd05a0d0b31382cce`; Laufbeginn: 2026-11-25T10:49:33.931Z.

`{"turns":25,"answered":22,"errors":3,"structuredReplies":0,"repeatedReplies":0,"forbiddenReplies":0,"missingRuleReplies":0,"referralFalsePositives":0,"configuredLinks":4}`

| Fall | Eingang (Berlin) | Antwort | Wiederholungen | Verbotene Sätze | Passende Regeln | Regeln im Kontext | Genutzte Regeln laut Prüfer | Link | Team |
|---|---|---|---|---|---|---|---|---|---|
| C01-1 | 25.11.26, 07:12:21 | ja | – | – | termin-absagen, termin-verschieben | mit-einem-menschen-sprechen, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, weiss-noch-nicht-wann-ich-zeit-habe, beschwerde, termin-absagen, zweitmeinung, termin-verschieben | termin-verschieben | configured | info |
| C01-2 | 25.11.26, 07:15:16 | ja | – | – | dank-und-lob | mit-einem-menschen-sprechen, beschwerde, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, ratenzahlung-gewuenscht, medizinische-frage-zu-medikamenten-schmerzen-ode, lieferanten-labor-und-dienstleister, dank-und-lob | nicht ausgewiesen | – | – |
| C02-3 | 24.11.26, 16:21:24 | ja | – | – | – | urlaub-feiertage-und-brueckentage, unterlagen-roentgenbilder-oder-praxiswechsel, spange-schiene-oder-aligner-verloren, mit-einem-menschen-sprechen, zugang-klappt-trotz-anleitung-nicht, lieferanten-labor-und-dienstleister | nicht ausgewiesen | – | info |
| C02-4 | 24.11.26, 16:25:22 | ja | – | – | – | spange-schiene-oder-aligner-verloren, urlaub-feiertage-und-brueckentage, unterlagen-roentgenbilder-oder-praxiswechsel, zugang-klappt-trotz-anleitung-nicht, ratenzahlung-gewuenscht, lieferanten-labor-und-dienstleister | nicht ausgewiesen | – | info |
| C03-5 | 24.11.26, 15:01:07 | ja | – | – | – | beschwerde, zugang-klappt-trotz-anleitung-nicht, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, ratenzahlung-gewuenscht, unterlagen-roentgenbilder-oder-praxiswechsel | nicht ausgewiesen | – | act |
| C03-6 | 24.11.26, 16:29:05 | ja | – | – | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | zahlung-ist-erledigt, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, beschwerde, termin-absagen, erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | nicht ausgewiesen | – | act |
| C03-7 | 24.11.26, 16:29:52 | ja | – | – | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | zahlung-ist-erledigt, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, termin-absagen, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, beschwerde, erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | nicht ausgewiesen | – | act |
| C03-8 | 24.11.26, 17:38:15 | guard_rejected | – | – | – | verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, zahlung-ist-erledigt, termin-absagen, beschwerde, termin-verpasst-oder-vergessen, termin-verschieben | nicht ausgewiesen | – | – |
| C04-9 | 24.11.26, 14:22:13 | guard_rejected | – | – | – | verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, termin-absagen, termin-verpasst-oder-vergessen, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, weiss-noch-nicht-wann-ich-zeit-habe | nicht ausgewiesen | – | – |
| C05-10 | 23.11.26, 12:42:44 | ja | – | – | dank-und-lob, termin-besprechung | verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, wann-ist-mein-termin, termin-absagen, beschwerde, mit-einem-menschen-sprechen, lieferanten-labor-und-dienstleister, dank-und-lob, termin-besprechung | nicht ausgewiesen | – | act |
| C06-11 | 23.11.26, 12:05:21 | ja | – | – | was-kostet-die-behandlung | fehler-in-der-rechnung, was-muss-ich-zum-termin-mitbringen, zahlung-ist-erledigt, zugang-klappt-trotz-anleitung-nicht, sportmundschutz-oder-zahnschutz, ratenzahlung-gewuenscht, was-kostet-die-behandlung | was-kostet-die-behandlung | configured | – |
| C07-12 | 24.11.26, 17:00:25 | ja | – | – | wo-finde-ich-meine-rechnung, rechnung-bei-versicherung-oder-beihilfe-einreich | fehler-in-der-rechnung, medizinische-frage-zu-medikamenten-schmerzen-ode, was-muss-ich-zum-termin-mitbringen, zugang-klappt-trotz-anleitung-nicht, mit-einem-menschen-sprechen, lieferanten-labor-und-dienstleister, wo-finde-ich-meine-rechnung, rechnung-bei-versicherung-oder-beihilfe-einreich | zugang-klappt-trotz-anleitung-nicht | animacura.io | act |
| C08-13 | 24.11.26, 19:31:11 | ja | – | – | – | termin-verpasst-oder-vergessen, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, termin-absagen, beschwerde, termin-verschieben, medizinische-frage-zu-medikamenten-schmerzen-ode | nicht ausgewiesen | – | act |
| C09-14 | 24.11.26, 16:08:09 | ja | – | – | wo-finde-ich-meine-rechnung | fehler-in-der-rechnung, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, ratenzahlung-gewuenscht, spange-schiene-oder-aligner-verloren, zugang-klappt-trotz-anleitung-nicht, wo-finde-ich-meine-rechnung | nicht ausgewiesen | – | act |
| C10-15 | 24.11.26, 15:18:45 | ja | – | – | termin-absagen | beschwerde, mit-einem-menschen-sprechen, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, medizinische-frage-zu-medikamenten-schmerzen-ode, termin-absagen, lieferanten-labor-und-dienstleister | termin-absagen | configured | info |
| C11-16 | 24.11.26, 14:28:44 | ja | – | – | wo-finde-ich-meine-rechnung, zahlung-ist-erledigt | zahlung-ist-erledigt, fehler-in-der-rechnung, rechnung-an-eine-andere-person-oder-adresse, doppelt-bezahlt-oder-guthaben, ratenzahlung-oder-spaeterer-zahlungstermin, krankenkasse-oder-versicherung-gewechselt, wo-finde-ich-meine-rechnung | nicht ausgewiesen | – | act |
| C12-17 | 24.11.26, 12:04:22 | ja | – | – | – | beschwerde, fehler-in-der-rechnung, neue-adresse-telefonnummer-oder-e-mail, rueckruf-gewuenscht, spange-schiene-oder-aligner-verloren, lieferanten-labor-und-dienstleister | nicht ausgewiesen | – | act |
| C13-18 | 24.11.26, 09:35:55 | ja | – | – | wo-finde-ich-meine-rechnung, erstattung-durch-krankenkasse-oder-versicherung, spontan-vorbeikommen, guthaben-zurueckueberweisen | rechnung-auf-papier-gewuenscht, ratenzahlung-gewuenscht, fehler-in-der-rechnung, krankenkasse-oder-versicherung-gewechselt, zahlung-ist-erledigt, wo-finde-ich-meine-rechnung, erstattung-durch-krankenkasse-oder-versicherung, spontan-vorbeikommen, guthaben-zurueckueberweisen | wo-finde-ich-meine-rechnung | – | – |
| C14-19 | 24.11.26, 08:17:39 | ja | – | – | etwas-in-der-praxis-vergessen | verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, beschwerde, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, spange-schiene-oder-aligner-verloren, zahlung-ist-erledigt, etwas-in-der-praxis-vergessen | nicht ausgewiesen | – | – |
| C15-20 | 24.11.26, 07:50:19 | ja | – | – | – | verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, termin-absagen, weiss-noch-nicht-wann-ich-zeit-habe, termin-verschieben, termin-verpasst-oder-vergessen, lieferanten-labor-und-dienstleister | nicht ausgewiesen | – | – |
| C16-21 | 23.11.26, 15:52:23 | guard_rejected | – | – | termin-verschieben | mit-einem-menschen-sprechen, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, beschwerde, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, ratenzahlung-gewuenscht, termin-verschieben | nicht ausgewiesen | – | – |
| C17-22 | 23.11.26, 09:28:30 | ja | – | – | dank-und-lob | dank-und-lob, begruessung-ohne-anliegen, urlaub-feiertage-und-brueckentage, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, fehler-in-der-rechnung, ratenzahlung-gewuenscht | nicht ausgewiesen | – | – |
| C18-23 | 23.11.26, 11:23:18 | ja | – | – | – | mit-einem-menschen-sprechen, beschwerde, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, medizinische-frage-zu-medikamenten-schmerzen-ode, verspaetung-zum-termin | nicht ausgewiesen | – | act |
| C19-24 | 23.11.26, 13:47:04 | ja | – | – | – | ratenzahlung-gewuenscht, geschwisterkind-anmelden, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, herausnehmbare-spange-passt-nicht-oder-drueckt, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze | nicht ausgewiesen | configured | – |
| C20-25 | 25.11.26, 09:32:24 | ja | – | – | wo-finde-ich-meine-rechnung | krankenkasse-oder-versicherung-gewechselt, fehler-in-der-rechnung, spange-schiene-oder-aligner-verloren, urlaub-feiertage-und-brueckentage, ratenzahlung-gewuenscht, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, wo-finde-ich-meine-rechnung | nicht ausgewiesen | – | – |
## Nachher

Systemtext/Core-SHA256: `5b3a99882da8d49516f459cb93d93857d3c577a7adea1d9f1bb13dbb93e95af4`; Laufbeginn: 2026-11-25T10:57:40.043Z.

`{"turns":25,"answered":24,"errors":1,"structuredReplies":0,"repeatedReplies":0,"forbiddenReplies":0,"missingRuleReplies":0,"referralFalsePositives":0,"configuredLinks":4}`

| Fall | Eingang (Berlin) | Antwort | Wiederholungen | Verbotene Sätze | Passende Regeln | Regeln im Kontext | Genutzte Regeln laut Prüfer | Link | Team |
|---|---|---|---|---|---|---|---|---|---|
| C01-1 | 25.11.26, 07:12:21 | guard_rejected | – | – | termin-absagen, termin-verschieben | mit-einem-menschen-sprechen, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, weiss-noch-nicht-wann-ich-zeit-habe, beschwerde, termin-absagen, zweitmeinung, termin-verschieben | nicht ausgewiesen | – | – |
| C01-2 | 25.11.26, 07:15:16 | ja | – | – | dank-und-lob | mit-einem-menschen-sprechen, beschwerde, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, ratenzahlung-gewuenscht, medizinische-frage-zu-medikamenten-schmerzen-ode, lieferanten-labor-und-dienstleister, dank-und-lob | nicht ausgewiesen | – | – |
| C02-3 | 24.11.26, 16:21:24 | ja | – | – | – | urlaub-feiertage-und-brueckentage, unterlagen-roentgenbilder-oder-praxiswechsel, spange-schiene-oder-aligner-verloren, mit-einem-menschen-sprechen, zugang-klappt-trotz-anleitung-nicht, lieferanten-labor-und-dienstleister | nicht ausgewiesen | – | info |
| C02-4 | 24.11.26, 16:25:22 | ja | – | – | – | spange-schiene-oder-aligner-verloren, urlaub-feiertage-und-brueckentage, unterlagen-roentgenbilder-oder-praxiswechsel, zugang-klappt-trotz-anleitung-nicht, ratenzahlung-gewuenscht, lieferanten-labor-und-dienstleister | nicht ausgewiesen | – | info |
| C03-5 | 24.11.26, 15:01:07 | ja | – | – | – | beschwerde, zugang-klappt-trotz-anleitung-nicht, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, ratenzahlung-gewuenscht, unterlagen-roentgenbilder-oder-praxiswechsel | nicht ausgewiesen | – | act |
| C03-6 | 24.11.26, 16:29:05 | ja | – | – | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | zahlung-ist-erledigt, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, beschwerde, termin-absagen, erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | erstattung-durch-krankenkasse-oder-versicherung | – | act |
| C03-7 | 24.11.26, 16:29:52 | ja | – | – | erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | zahlung-ist-erledigt, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, termin-absagen, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, beschwerde, erstattung-durch-krankenkasse-oder-versicherung, dank-und-lob | nicht ausgewiesen | – | act |
| C03-8 | 24.11.26, 17:38:15 | ja | – | – | – | verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, zahlung-ist-erledigt, termin-absagen, beschwerde, termin-verpasst-oder-vergessen, termin-verschieben | nicht ausgewiesen | – | act |
| C04-9 | 24.11.26, 14:22:13 | ja | – | – | – | verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, termin-absagen, termin-verpasst-oder-vergessen, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, weiss-noch-nicht-wann-ich-zeit-habe | nicht ausgewiesen | – | – |
| C05-10 | 23.11.26, 12:42:44 | ja | – | – | dank-und-lob, termin-besprechung | verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, wann-ist-mein-termin, termin-absagen, beschwerde, mit-einem-menschen-sprechen, lieferanten-labor-und-dienstleister, dank-und-lob, termin-besprechung | nicht ausgewiesen | – | act |
| C06-11 | 23.11.26, 12:05:21 | ja | – | – | was-kostet-die-behandlung | fehler-in-der-rechnung, was-muss-ich-zum-termin-mitbringen, zahlung-ist-erledigt, zugang-klappt-trotz-anleitung-nicht, sportmundschutz-oder-zahnschutz, ratenzahlung-gewuenscht, was-kostet-die-behandlung | was-kostet-die-behandlung | configured | – |
| C07-12 | 24.11.26, 17:00:25 | ja | – | – | wo-finde-ich-meine-rechnung, rechnung-bei-versicherung-oder-beihilfe-einreich | fehler-in-der-rechnung, medizinische-frage-zu-medikamenten-schmerzen-ode, was-muss-ich-zum-termin-mitbringen, zugang-klappt-trotz-anleitung-nicht, mit-einem-menschen-sprechen, lieferanten-labor-und-dienstleister, wo-finde-ich-meine-rechnung, rechnung-bei-versicherung-oder-beihilfe-einreich | wo-finde-ich-meine-rechnung, rechnung-bei-versicherung-oder-beihilfe-einreich | animacura.io. | – |
| C08-13 | 24.11.26, 19:31:11 | ja | – | – | – | termin-verpasst-oder-vergessen, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, termin-absagen, beschwerde, termin-verschieben, medizinische-frage-zu-medikamenten-schmerzen-ode | nicht ausgewiesen | – | act |
| C09-14 | 24.11.26, 16:08:09 | ja | – | – | wo-finde-ich-meine-rechnung | fehler-in-der-rechnung, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, ratenzahlung-gewuenscht, spange-schiene-oder-aligner-verloren, zugang-klappt-trotz-anleitung-nicht, wo-finde-ich-meine-rechnung | nicht ausgewiesen | – | act |
| C10-15 | 24.11.26, 15:18:45 | ja | – | – | termin-absagen | beschwerde, mit-einem-menschen-sprechen, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, medizinische-frage-zu-medikamenten-schmerzen-ode, termin-absagen, lieferanten-labor-und-dienstleister | termin-absagen | configured | info |
| C11-16 | 24.11.26, 14:28:44 | ja | – | – | wo-finde-ich-meine-rechnung, zahlung-ist-erledigt | zahlung-ist-erledigt, fehler-in-der-rechnung, rechnung-an-eine-andere-person-oder-adresse, doppelt-bezahlt-oder-guthaben, ratenzahlung-oder-spaeterer-zahlungstermin, krankenkasse-oder-versicherung-gewechselt, wo-finde-ich-meine-rechnung | nicht ausgewiesen | – | act |
| C12-17 | 24.11.26, 12:04:22 | ja | – | – | – | beschwerde, fehler-in-der-rechnung, neue-adresse-telefonnummer-oder-e-mail, rueckruf-gewuenscht, spange-schiene-oder-aligner-verloren, lieferanten-labor-und-dienstleister | nicht ausgewiesen | – | act |
| C13-18 | 24.11.26, 09:35:55 | ja | – | – | wo-finde-ich-meine-rechnung, erstattung-durch-krankenkasse-oder-versicherung, spontan-vorbeikommen, guthaben-zurueckueberweisen | rechnung-auf-papier-gewuenscht, ratenzahlung-gewuenscht, fehler-in-der-rechnung, krankenkasse-oder-versicherung-gewechselt, zahlung-ist-erledigt, wo-finde-ich-meine-rechnung, erstattung-durch-krankenkasse-oder-versicherung, spontan-vorbeikommen, guthaben-zurueckueberweisen | wo-finde-ich-meine-rechnung | animacura.io | – |
| C14-19 | 24.11.26, 08:17:39 | ja | – | – | etwas-in-der-praxis-vergessen | verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, beschwerde, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, spange-schiene-oder-aligner-verloren, zahlung-ist-erledigt, etwas-in-der-praxis-vergessen | nicht ausgewiesen | – | – |
| C15-20 | 24.11.26, 07:50:19 | ja | – | – | – | verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, termin-absagen, weiss-noch-nicht-wann-ich-zeit-habe, termin-verschieben, termin-verpasst-oder-vergessen, lieferanten-labor-und-dienstleister | nicht ausgewiesen | – | act |
| C16-21 | 23.11.26, 15:52:23 | ja | – | – | termin-verschieben | mit-einem-menschen-sprechen, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, beschwerde, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, ratenzahlung-gewuenscht, termin-verschieben | termin-verschieben | configured | info |
| C17-22 | 23.11.26, 09:28:30 | ja | – | – | dank-und-lob | dank-und-lob, begruessung-ohne-anliegen, urlaub-feiertage-und-brueckentage, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, fehler-in-der-rechnung, ratenzahlung-gewuenscht | nicht ausgewiesen | – | – |
| C18-23 | 23.11.26, 11:23:18 | ja | – | – | – | mit-einem-menschen-sprechen, beschwerde, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, medizinische-frage-zu-medikamenten-schmerzen-ode, verspaetung-zum-termin | nicht ausgewiesen | – | act |
| C19-24 | 23.11.26, 13:47:04 | ja | – | – | – | ratenzahlung-gewuenscht, geschwisterkind-anmelden, lieferanten-labor-und-dienstleister, nachricht-von-einer-anderen-praxis, herausnehmbare-spange-passt-nicht-oder-drueckt, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze | nicht ausgewiesen | configured | – |
| C20-25 | 25.11.26, 09:32:24 | ja | – | – | wo-finde-ich-meine-rechnung | krankenkasse-oder-versicherung-gewechselt, fehler-in-der-rechnung, spange-schiene-oder-aligner-verloren, urlaub-feiertage-und-brueckentage, ratenzahlung-gewuenscht, verspaetung-von-mehr-als-15-minuten-oder-ohne-ze, wo-finde-ich-meine-rechnung | nicht ausgewiesen | – | – |

## Ergebnis und manuelle Einordnung

Ausgangsstand: `269adbb`. Vor der ersten Anweisungsänderung wurden alle 20 echten Chats / 25 Eingänge vollständig ausgeführt. Der erste Zwischenstand (`2026-11-25-reliability-first-pass.md`) wurde vor der nächsten Änderung ebenfalls abgeschlossen. Das Manifest stammt unverändert aus dem Berichtsgenerator. Keine Patientendaten in Git, kein Versand, keine Praxisbenachrichtigungen aus den Tests.

| Zusätzliche Prüfung der zurückgegebenen Antworten | Vorher | Abschließender vollständiger Lauf |
|---|---:|---:|
| Beantwortete Eingänge | 22 | 24 |
| Zurückgehaltene Entwürfe | 3 | 1 |
| Erkannte unbelegte eigene Erledigungsbehauptungen | 3 | 0 |
| Erkannte Rückmeldefristen | 0 | 0 |
| Technische Fehler | 0 | 0 |

Die drei vorherigen Erledigungsbehauptungen betrafen C01-1, C05-10 und C09-14. Nachher bleiben nötige Teamprüfungen ohne behauptete Voraberledigung möglich. Der Ausgabefilter erkennt auch direkte Weiterleitungsaussagen und ein angeblich bereits informiertes Team. Ein Ausführungsbeleg muss serverseitig geliefert werden, zu Patient, Handlung, Wortlaut und Zeitpunkt passen und eine Referenz enthalten. Patientenangaben sind kein Ausführungsbeleg. Der aktuelle reine Antwortgenerator führt selbst keine Termin-/Kontoänderung durch und liefert daher keine solchen Belege.

**Verbleibende Einschränkung:** C01-1 wird im abschließenden Lauf wegen der generischen Aussage, Schonen sei bei Husten richtig, als `medical_advice` zurückgehalten. Das ist eine konservative verbleibende Qualitätsgrenze. Die Verbesserung ist keine Behauptung, dass der Modellprüfer jede zulässige Aussage bereits zuverlässig erkennt. Einzelne Antworten sind noch unnötig lang oder enthalten Floskeln.

**Manuell geprüfte Fragen:** C03-7/C03-8 verwenden das bereits mitgeteilte Geburtsdatum. C12-17 fragt nach dem tatsächlich unklaren Vorgang statt erneut nach Name/Geburtsdatum. C13-18 fragte im vollständigen Modelllauf noch nach einem bereits genannten Angehörigennamen zusammen mit dem fehlenden Geburtsdatum. Ein anschließender reiner Codefilter entfernt nur den belegbar wiederholten Namensteil und erhält die Geburtsdatumsfrage. Dieser Filter wurde mit der tatsächlichen eingefrorenen Antwort und den zugehörigen Eingaben sowie Regressionstests geprüft; die Tabelle oben bleibt die unveränderte Voll-Lauf-Ausgabe. Ähnliche Namen oder nur gewöhnliche großgeschriebene Wörter genügen nicht als Beleg.

Die vorhandene lokale Offline-Brücke ergänzt ausschließlich die zuvor lesend ermittelte Rechnungszustellung für C20; für andere Patienten ist dieser zusätzliche Dienst lokal nicht verfügbar. Der Vergleich ist kein HTTP-Ende-zu-Ende-Test des Rechnungsdienstes. Der echte gemeldete Kind-/Wettkampf-Fall wurde zusätzlich lesend wiederholt: richtige bestätigte Akte, Patientenblatt geladen, empathische Minutenfrage, kein Versand.

## Stabilerer Prüfschritt

- Die Prüfanweisung trennt zulässige Aussagen, echte Verstöße und Stilwünsche. Die erste Prüfung verwendet nun `reasoning=low`.
- Widersprüchliche Befunde, Zitate außerhalb des Entwurfs oder ein widersprüchliches Gesamturteil führen zu höchstens einer korrigierten Prüfung je Entwurf. Ein weiter widersprüchlicher Befund erlaubt keine Antwort. Die Regressionstests belegen ausdrücklich, dass dadurch keine vertrauliche Aussage freigegeben wird.
- Beobachtbare Verspätungsfehler (vorschnelle Annahme/Link, Link innerhalb der Toleranz) werden im Code geprüft. Modellkritik an einer sonst korrekten Formulierung kann einen korrekten Selbstverschiebe-/Ausnahmeablauf nicht allein blockieren.
- Unbelegte eigene Handlungen werden auch dann erkannt, wenn der Modellprüfer sie übersieht. Nach einem Korrekturversuch werden verbleibende eindeutig erkannte Erledigungssätze entfernt; der sachliche Rest bleibt erhalten. Bleibt nichts übrig, wird nichts gesendet.

## Namen, Rollen und Gesprächsverlauf

Zusammengesetzte Namen, Bindestriche, abweichende Namensreihenfolge, Namenspartikel und weitere Angehörigenbezüge werden berücksichtigt. Gemeinsame Partikel wie „de la“ allein liefern keinen Nachnamenstreffer. Eine einzelne Schreibabweichung bei ausreichend langen Namensbestandteilen kann Kandidaten liefern, bestätigt aber niemals die Identität – auch nicht allein wegen einer bereits verknüpften ID. Patientenakten werden weder zusammengeführt noch verändert.

Kurze Folgeantworten nutzen den zuvor ausdrücklich genannten Patienten. Ein ausdrücklich genannter anderer Patient, ein Selbstbezug oder ein alter/zukünftiger Verlauf verhindert die Übernahme. Ein Kindname wird nicht als Name des Absenders behandelt; aus dem Nachnamen des Kindes wird keine unbelegte Elternanrede gebildet. Ein Termindatum wird nicht als Geburtsdatum verwendet. Nachgelagerte reine Anrede-/Fragenkorrekturen geben keine zusätzlichen Aktendaten frei.

## Zusammenhängende Modellgespräche

Reproduzierbarer lesender Runner: `scripts/animahost-dialogue-sequences.mts TENANT PRIVATE_OUTPUT`. Er verwendet ausschließlich künstliche Patienten und führt die tatsächlich erzeugte Antwort als Verlauf des nächsten Schrittes mit. Keine Versand-/Schreibroute.

| Folge | Schritte | Erfolgreicher Abschlusslauf |
|---|---|---|
| S01 | Unklare Verspätung → zehn Minuten → Danke | 3/3; Rückfrage, Toleranz, danach bewusst still |
| S02 | Wettkampfende → 20 Minuten → lange Anfahrt/Ausnahmebitte | 3/3; Minutenfrage, eigener Buchungslink, anschließend Teamentscheidung ohne zweiten Link |
| S03 | Sohn → Wechsel zur Tochter → zehn Minuten | 3/3; richtige Person in allen Schritten, keine veraltete Zuordnung |

Der erste Zwischenlauf zeigte zwei fälschlich blockierte S02-Antworten. Nach der Korrektur bestanden zwei vollständige Wiederholungen jeweils **9/9** Schritte, ohne Frist, unbelegte Erledigung oder Identitätswechsel. Die spätere reine Anredekorrektur ist zusätzlich durch Regressionstests abgedeckt.

## Späterer technischer Teststopp

Weitere Wiederholungen nach den erfolgreichen Voll- und Gesprächsläufen scheiterten am Modelldienst: zuerst `GatewayInternalServerError`, anschließend mit einer minimalen Anfrage eindeutig als **HTTP 402 – positives AI-Gateway-Guthaben erforderlich** diagnostiziert. Ein weiterer Gesprächslauf hatte acht technische Fehler (der reine Danke-Schritt benötigt kein Modell). Diese fehlgeschlagenen Zusatzläufe werden nicht als bestandene Tests gezählt. Es wurde kein Modell gewechselt, kein Guthaben aufgeladen und nichts an Patienten gesendet.

Die vollständigen Vorher-/Nachher-Artefakte bleiben ohne technische Fehler. Nach den letzten reinen Codefiltern wurden deren Regressionstests und die eingefrorene C13-Antwort geprüft; eine weitere Modellwiederholung dieser letzten Filter war wegen des Guthabenstopps nicht möglich. Neue produktive Modellantworten benötigen ebenfalls wieder positives Gateway-Guthaben.
