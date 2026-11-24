# AnimaHost Retrieval v1 – Vertrag für Claude

Stand: 23.11.2026. Der neue Kern ist in Production aktiv. Der Probelauf verwendet denselben Antwortkern unabhängig vom Produktionsschalter.

## Antwort und Quellen

Die Antwort enthält weiterhin `action`, `rule`, `text`, `skipSend`, gegebenenfalls `teamSummary` und `details`. Der neue Kern klassifiziert keine fachlichen Regel-IDs. Eine beantwortete Nachricht trägt `rule: "retrieval:answered"`.

`details.architecture` ist `retrieval-v1`. `details.answerEvidence` und `retrieved` enthalten vier getrennte Listen:

```json
{
  "gold": [{"kind":"gold","ref":"gold-draht-wunschtermin","version":1,"date":"2026-11-22T00:00:00Z","preview":false}],
  "knowledge": [],
  "rule": [],
  "history": []
}
```

Gold ist die Stilvorlage. Knowledge und Rule sind Fakten. History sind anonymisierte frühere Praxisabläufe, keine Stilvorbilder und keine Zusagen für den aktuellen Patienten. Alle Listen dokumentieren **die dem Antwortkern tatsächlich mitgegebenen Quellen**. Sie beweisen nicht, dass jeder Satz auf jeder Quelle beruht. Es gibt keine vom Modell erfundenen Referenzen und keine zusätzliche Quellen-ID-Prüfschranke. Darstellungsvorschlag: „Für diese Antwort herangezogene Quellen“, getrennt nach Goldbeispielen, Wissen/Regelbuch und früheren Praxisfällen.

Die Quellen werden unabhängig von der Anzeige gespeichert. Abruf mit bestehender Leitstand-Sitzung, Rollen `admin` oder `verwaltung`:

- `GET /api/animahost/control?resource=reply_evidence&messageId=<eingehende WhatsApp-Nachrichten-ID>`: `{answerEvidence:{architecture, created_at, evidence, timings}}`, oder `{answerEvidence:null}` bei einer alten Antwort ohne Quellenprotokoll.
- `GET /api/animahost/control?resource=retrieval_document&kind=gold|knowledge|rule|history&ref=<ref>&version=<version>`: `{document:{kind,ref,version,source_at,title,payload,draft}}` (oder `document:null`). Bei Gold/History enthält `payload` `question` und `answer`, bei Wissen `content`, `guidance`, `sources`, bei Regeln `fact`.
- `GET /api/animahost/control?resource=gold_examples`: `{examples:[...]}`, aktive Goldbeispiele einschließlich `indexed_at`; noch nicht indexierte Beispiele sind erkennbar.

Referenzen als undurchsichtige Zeichenketten behandeln und URL-kodieren. Keine Telefon-/Patienten-/Archivkennungen aus Referenzen ableiten. `date` ist das Datum der jeweiligen Quelle, kein Terminangebot. Historische Antworttexte niemals als ungeprüfte aktuelle Empfehlung darstellen. Die Originalkennungen der Archivpaare bleiben serverseitig und werden nicht an das Modell oder diese Anzeige geliefert.

Bei HTTP 402 oder 429 des Modellanbieters bleibt der Eingang unter „Wartet auf euch“. Im Chat steht `rule:chain:guard_rejected` mit `details.modelFailure:{code:"model_budget_exhausted",stage:"compose"|"verify",httpStatus:402|429}`. AnimaDesk zeigt „Eingang ohne Antwort“ mit „Modellbudget erschöpft“. Der Fall löst eine wichtige Praxisbenachrichtigung aus. Der Live-Bericht zählt diese Eingänge separat von den tatsächlich gesendeten Antworten.

## „Als Goldbeispiel übernehmen“

`POST /api/animahost/control`, bestehende Sitzung, gleicher Origin, Rolle `admin` oder `verwaltung`:

```json
{
  "action":"mark_gold_example",
  "sourceRef":"eindeutige-referenz-der-praxisantwort",
  "sourceAt":"2026-11-23T10:00:00+01:00",
  "question":"Erfundenes Patientenanliegen für dieses Beispiel",
  "answer":"Die von der Praxis ausgewählte gute Antwort",
  "context":"Optionaler fachlicher Kontext"
}
```

Grenzen: `sourceRef` 1–200, Frage 1–4000, Antwort 1–2000, Kontext höchstens 1000 Zeichen. Die Aktion setzt eine bewusste Auswahl der Praxis voraus. `actorId` wird ausschließlich aus der Sitzung ergänzt. Namen und Kontakt-/Patientenkennungen werden vor dem Indexieren entfernt: zunächst lokal, anschließend mit einer zusätzlichen Namensprüfung über den bestehenden EU-/ZDR-Modellzugang. Die Prüfung liefert nur weitere zu entfernende Textstellen; sie schreibt keine Fakten um. Keine rohen Aktenauszüge als Kontext übertragen.

Antwort: `{ref,version,sourceAt,indexed,status}`. HTTP 201 mit `status:indexed`: sofort suchbar. HTTP 202 mit `status:pending`: Auswahl dauerhaft gespeichert, Indexierung wird vom geschützten Fünf-Minuten-Abgleich wiederholt. Nicht erneut markieren, nur weil die Indexierung noch läuft. Erneutes Markieren derselben `sourceRef` erzeugt bewusst eine neue Version und ersetzt die aktive Version. Bei `gold_anonymization_unavailable` (503) wurde noch nichts übernommen; Eingaben erhalten und erneut versuchen. Fehler `gold_actor_forbidden` (403), `control_invalid` (400), `control_unavailable`/`animahost_unavailable` (503).

## Probelauf

`POST /api/animaline/replay` bleibt die vorhandene Leitstand-Aktion für den jüngsten beantworteten Text im ausgewählten Chat. `knowledgeMode` ist `approved` (Standard) oder `draft_preview`. Die interne Cura-Route unterstützt zusätzlich `messageType`, leeren `text`, `hasPriorConversation` und `hasPriorReply`, damit Testläufe Reaktionen/Sticker genauso behandeln wie die Live-Strecke.

Die Antwort enthält `architecture:retrieval-v1`, `knowledgeMode`, `result`, `calls`, `timings`, `ms`. Die bestehenden Felder `result.ok`, `asksIdentity`, `attempts`, `reason` bleiben als Kompatibilitätsfelder erhalten. Zusätzlich:

- `result.substantive`: Selbsteinschätzung des Antwortkerns, keine unabhängige Qualitätsabnahme.
- `result.excluded`: Absenderprüfung hat ausgeschlossen.
- `result.skipSend`: nichts senden. Bei `social:*` auch keinen Klärfall erzeugen.
- `result.repairs`, `violations`, `retrieved`: Nachbesserung, etwaige Zurückhaltung und Quellen.
- `timings`: Kontext, Embedding, Suche, Modell, gesamte Dauer in Millisekunden; `calls` enthält nur technische Modellkennzahlen.

`draft_preview` deutlich als „Probelauf mit vorläufig verwendetem Entwurfswissen“ kennzeichnen. Es ändert weder Freigabeperson noch Freigabezeit der 51 Einträge und darf nicht in Live-Versand umgedeutet werden. Der interne Probelauf schreibt keine Antwortentscheidung, keinen Fall und keine Benachrichtigung und versendet nichts.

## Modellverbrauch pro Antwort und Monat

`GET /api/animahost/control?resource=usage_month` für `admin` und `verwaltung`. Der Proxy leitet an den bestehenden internen Endpunkt weiter. Abrechnungsmonat in `Europe/Berlin`, Zeitraum `[from,to)`, Datenstand `asOf`. Währung `USD`. Beispiel für die Antwortform:

```json
{
  "month": "2026-11", "timezone": "Europe/Berlin",
  "from": "2026-10-31T23:00:00.000Z", "to": "2026-11-30T23:00:00.000Z",
  "asOf": "2026-11-23T22:00:00.000Z", "currency": "USD",
  "answerCount": 2, "costedAnswerCount": 2, "unmeteredAnswers": 0,
  "totalCostUsd": 0.0024, "averageCostUsd": 0.0012,
  "inputTokens": 4200, "outputTokens": 180,
  "cacheReadTokens": 1600, "cacheWriteTokens": 1600,
  "modelCalls": 4, "unpricedCalls": 0, "complete": true,
  "creditBalanceUsd": 19.72, "creditScope": "gateway_team"
}
```

`answerCount` zählt die Live-Entscheidungen mit Antworttext des Retrieval-Kerns. Versandbestätigungen werden getrennt erfasst. `totalCostUsd` summiert belegte Aufrufe einschließlich Prüfung, Überarbeitung und zurückgehaltener Entwürfe. `averageCostUsd` teilt die Monatssumme durch die erzeugten Antworten und ist bei null Antworten oder unvollständigen Belegen `null`. `complete:false` bedeutet, dass die Summe nur den belegten Teil abdeckt. Mit `unmeteredAnswers` und `unpricedCalls` lässt sich das in der Ansicht kennzeichnen. Probeläufe gehen nicht ein. `creditBalanceUsd` ist der gemeinsame Gateway-Kontostand oder `null`, wenn der Abruf fehlschlägt. Er ist kein Praxisbudget. HTTP 503 mit `animahost_usage_unavailable`, wenn die Antwortbelege nicht gelesen werden können. Identitäten oder Behandlungsdaten werden nicht ausgegeben.

Im Antwortbeleg steht `answerEvidence.timings.usage` mit `model`, `answered`, `modelCalls`, `pricedCalls`, `unpricedCalls`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens` und `costUsd`. Bei älteren Belegen fehlt das Feld. Bei einem Modellaufruf ohne Preisbeleg kann `costUsd` null sein. Eine Antwort ohne Modellaufruf hat Kosten von 0 USD.

Der Cache-Marker sitzt ausschließlich auf den festen Systemanweisungen der Erzeugung und Prüfung, einschließlich Ton, Anrede und fest verankerter Praxis- und Sicherheitsregeln. Änderungen an diesem Wortlaut ergeben einen neuen Cache-Schlüssel. Gefundene Regelbuch- und Wissenseinträge sind weiterhin fallabhängige Quellen. Nachricht, Patientenblatt, Verlauf und gefundene Quellen bleiben hinter dem Marker. Der Cache wird nur für die unterstützte Anthropic-Live-Strecke gesetzt, die Europa und Zero Data Retention beibehält. Aufrufe nach Ablauf des Fünf-Minuten-Caches können den Aufpreis für das erneute Schreiben verursachen.

Stille Reaktionen, leere Nachrichten und Abschlüsse sind erwartete Ergebnisse, keine fehlgeschlagenen Antworten. Für die neue Darstellung nicht den alten Erklärungstext verwenden, dass anschließend eine bisherige Fallback-Antwort versendet werde: In der neuen Architektur gibt es diesen Ersatztext nicht.

## Aktivierung nach Juans Abnahme

Cura: `ANIMAHOST_RETRIEVAL_PASSED=true`. AnimaLine-Daemon: `ANIMALINE_RETRIEVAL_POLICY=1` (keine alten Themen-Fallbacks oder automatischen Folgeantworten). Die Praxis hat beide Schalter am 23.11.2026 für Production freigegeben. Der bisherige Kern bleibt nur für die noch aktive Strecke und als Rücknahmeweg im Code. Die neue Strecke umgeht dessen Klassifikation, Workflows und Nachbearbeitung vollständig. Ein Fehler erzeugt keinen erfundenen Ersatztext.

Die Architektur benötigt keine Neukopplung von WhatsApp. Historienimport und Reaktionen bleiben vom automatischen Antwortversand getrennt.

## 239er-Probelauf

`GET /api/animahost/whatsapp/internal/control?resource=acceptance_run`; AnimaDesk leitet unter `GET /api/animahost/control?resource=acceptance_run` für admin/verwaltung weiter. Private/no-store, bestehende Authentifizierung.

Antwort: `runId`, `completedAt`, `mode`, `knowledge`, `planned`, `completed`, `complete`, `validForAcceptance`, `technicalErrors`, `qualityFindings`, `stats`, `costs`, `cases`, `approvedCases`. `cases` enthält den Lauf mit vorläufigem Entwurfswissen (`draft_preview`). `approvedCases` enthält den getrennten Lauf nur mit freigegebenem Wissen. Je 239 Einträge. `complete` bestätigt die Vollständigkeit der Berechnung. Über die Qualitätsfreigabe informiert `validForAcceptance`.

Je Fall: `ref`, `at` (Zeitpunkt des Eingangs), `input` (anonymisiert), `answer` (anonymisiert), `retrieved:{gold,knowledge,rule,history}`, `status`, `sendDelaySeconds`, `sendStatus`. Quellen behalten Referenz, Version und Datum. Es wurde im Probelauf nichts gesendet: `sendDelaySeconds:null`, `sendStatus:not_sent_dry_run`; Erzeugungslaufzeit niemals als Versandverzögerung anzeigen. Rohkennungen, Namen und Telefonnummern sind nicht enthalten.

Der Ersatzlauf liefert zusätzlich `anrede` (`du` oder `Sie`), `clarificationStage` (1, 2, 3 oder null), `error` (Fehlercode, gegebenenfalls Erzeugungsschritt und HTTP-Status, sonst null), `recoveredErrors`, `priorErrors`, `timing` und `quality`. In `quality.patterns` stehen erkannte alte Sprachmuster. `validForAcceptance` setzt null terminale technische Fehler und null erkannte alte Muster voraus.

Unklare Eingänge: `conversation:clarify_first`, dann `conversation:clarify_second`, erst danach `conversation:outside_scope` mit ausgesprochener Übergabe ans Team. Zähler berücksichtigt tatsächlich im Verlauf versendete Nachfragen; eine inhaltliche Antwort setzt ihn zurück. Reaktionen/Dank bleiben still.

Regelbuch v9 beschreibt Anrede und Ton. Das aus Patientenblatt und Nachricht gewählte `anrede` wird in den Modellkontext geschrieben. Eltern und erwachsene Begleitpersonen erhalten Sie, selbst schreibende Patienten du. Bei unklarer Rolle beginnt die Unterhaltung mit Sie. Nach der ersten Antwort richtet sich die Anrede nach dem Gegenüber. Ein einzelnes Emoji ist im lockeren Du erlaubt. Bei Schmerzen, Notfällen, Absagen und Rechnungen bleibt der Ton warm und gerade. Vier Goldbeispiele decken Link mit du, Link mit Sie, Huhu und die zweite Nachfrage ab.

## Praxis übernimmt den Gesprächsfaden und Anlass jetzt vor Ort

AnimaLine sendet im internen Aufruf optional `lastOutbound:{source:"practice"|"animahost",at}` und dieselbe Quelle bei protokollierten ausgehenden Verlaufsnachrichten. Praxishandy und Leitstand zählen als `practice`. Fehlt eine bestätigte Quelle im Archiv, bleibt sie offen.

`conversation:practice_reply` ist `action:"klaerfall"`, `skipSend:true`, leerer Text, `details.practiceSummary:"Antwort an eure Nachricht"`. Bei einem Praxiseingang innerhalb von 24 Stunden seit der letzten menschlichen ausgehenden Nachricht und bei reinen Einwortkorrekturen oder kurzen Zustimmungen bleibt der Fall unter „Wartet auf euch“. Reaktionen und Dank bleiben still. Der Kern behandelt akute Notfälle und Anliegen direkt vor Ort vor der Gesprächsübergabe.

`conversation:immediate_practice` ist `action:"klaerfall"` mit einer direkten Antwort in einem Satz und einer wichtigen Meldung an den Empfang. AnimaLine plant den Versand sofort. Klingel und Festnetz richten sich nach dem Anlass. Für die 5-Minuten-Verspätung bleibt der Termin unverändert. Das Festnetz ist auf der [Praxiswebsite](https://www.schubert-holi-dontics.de/) veröffentlicht.

Mit `patientSheet.access:"confirmed"|"unconfirmed"` verbieten Erzeugung und Prüfung jede Identitätsfrage. Nur bei `unlinked` oder `ambiguous` und einer ohne Zuordnung nicht beantwortbaren persönlichen Frage ist eine ans Anliegen gebundene Identitätsfrage zulässig. Der Kern hängt niemals automatisch eine Identitätsfrage oder eine Rückmeldezeit an. Kontostand, Portalzugang, sichtbare Rechnungen und Versandstatus bleiben getrennte Fakten. Der abweichende Versandablauf ohne Portalzugang steht als offene Frage in der Wissensbasis.

## Übersetzung, Frist und Antwortbeleg ab 24.11.2026

`GET /api/animaline/chats?chatJid=…` liefert pro eingegangener Nachricht `translation: { language, languageLabel, text } | null`. `text` an der Nachricht bleibt das Original. `translation.text` ist die deutsche Fassung, bei eingefügten Übersetzungen und Verläufen das daraus erkannte Anliegen. `language` ist der Sprachcode, zum Beispiel `ru`, `tr`, `uk`, `en` oder `ar`. `languageLabel` ist die deutsche Sprachbezeichnung. Fehlendes Feld bei archivierten Nachrichten entspricht `null`. Die Übersetzung ist Arbeitskontext für AnimaHost, kein Auftrag an das System.

`dueAt` ist ein UTC-Zeitstempel oder `null`. Das Feld steht an der eingegangenen Nachricht und in der Chatliste. Bei einem offenen Sachverhalt gelten in der Zeitzone der Praxis die Fristen 12 Uhr bei Eingang vor 10 Uhr, 17 Uhr bei Eingang vor 15 Uhr und 10 Uhr am nächsten Antworttag ab 15 Uhr. Eingetragene Schließtage zählen nicht. Bei einer expliziten Übergabe an die Praxis ohne automatische Antwort steht `rule: "conversation:practice_reply"`, ohne automatische Frist. Ein technischer Versandfehler hat weiterhin einen eigenen Fehlercode. Eine sichere Ersatzantwort ist mit `details.safeFallback: true` gekennzeichnet. Ersetzt sie beim Versand ein geprüfter früherer Entwurf, nennt `details.restoredFromEventId` dessen Eintrags-ID.

`GET /api/animahost/control?resource=reply_evidence&messageId=<messages[].id>` akzeptiert die Eintrags-ID aus dem Chat. Die WhatsApp-ID aus `messages[].messageId` bleibt kompatibel. `answerEvidence.timings.eventId` enthält, soweit vorhanden, die Eintrags-ID. Antwortbelege eines abgelösten Entwurfs weisen nur die Quellen des Entwurfs nach. Versandstatus und tatsächlich verwendeten Entwurf zeigt der Chat. Der Endpunkt gibt bei fehlendem historischen Beleg weiterhin `null` zurück.

## Tagesdurchsicht — 24.11.2026

`GET /api/animahost/whatsapp/internal/control?resource=daily_review&day=2026-11-24&anonymize=1`. AnimaDesk: gleicher Query unter `/api/animahost/control`, weiterhin nur admin/verwaltung. Der Proxy übergibt seine vorhandene AnimaLine-Berechtigung ausschließlich serverseitig als `x-animaline-control` an den authentifizierten Cura-Endpunkt; der Browser erhält diesen Schlüssel nie. Direkte interne Aufrufer benötigen dieselbe zusätzliche Berechtigung (oder eine auf Cura konfigurierte `ANIMALINE_CONTROL_SECRET`). Ohne day gilt der heutige Tag in Europe/Berlin. `anonymize=1` ist Standard; `0` zeigt den autorisierten Originaltext. Fehler bei der Anonymisierung liefern 503, niemals stillschweigend Originaldaten. Keine Bewertungen, Punkte, Musterlisten oder Qualitätsquoten.

Antwort: `{day,timeZone,anonymized,entries}`. Jeder Eingang des Tages ist enthalten, auch Reaktionen, kurze Abschlüsse, ausgebliebene Antworten und technische Fehler. Je Eintrag: `at,input,messageType,answer,answerSent,sentAt,state,reason,rule,retrieved:{gold,knowledge,rule,history},checks,translation,patientSheet`. Im Originalmodus zusätzlich `eventId,messageId,chatJid`; im anonymisierten Modus nur die Tagesreferenz `ref` (E001 usw.).

`answerSent=false` und `sentAt=null` bedeutet: vorhandener Antworttext ist ein Entwurf, kein belegter Versand. `checks` enthält die Prüfung je Entwurf mit ausschließlich harten Grenzen; null bedeutet bei älteren Einträgen, dass kein solches Prüfprotokoll vorliegt. `translation` enthält Sprache und deutsche Übersetzung, falls vorhanden. Quellen bleiben Referenzen mit Version/Datum.

Antwortkern: Systemtext `2026-11-24-systemtext-v1.md` unverändert, nur Platzhalter ersetzt. Der Textentwurf wird nicht nachformatiert. Ein harter Verstoß erlaubt genau einen zweiten Entwurf; ein weiterer Verstoß erzeugt ohne Ersatztext einen Klärfall mit Grund. Reine Kurzabschlüsse/Korrekturen und die letzte menschliche Antwort innerhalb 24 Stunden bleiben still. Bei Modell-/Transportausfall ist kein Text verfügbar: der technische Grund erscheint als Klärfall, keine erfundene Ersatzantwort.
