# AnimaHost Retrieval v1 – Vertrag für Claude

Stand: 23.11.2026. Der neue Produktionsschalter `ANIMAHOST_RETRIEVAL_PASSED` bleibt **aus**. Der Probelauf verwendet den neuen Kern unabhängig davon. Die Oberfläche baut Claude; keine neue Navigation oder Darstellung wurde hier eingebaut.

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

Stille Reaktionen, leere Nachrichten und Abschlüsse sind erwartete Ergebnisse, keine fehlgeschlagenen Antworten. Für die neue Darstellung nicht den alten Erklärungstext verwenden, dass anschließend eine bisherige Fallback-Antwort versendet werde: In der neuen Architektur gibt es diesen Ersatztext nicht.

## Aktivierung nach Juans Abnahme

Cura: `ANIMAHOST_RETRIEVAL_PASSED=true`. AnimaLine-Daemon: `ANIMALINE_RETRIEVAL_POLICY=1` (keine alten Themen-Fallbacks oder automatischen Folgeantworten). Beide bleiben bis zur Freigabe aus. Der bisherige Kern bleibt nur für die noch aktive Strecke und als Rücknahmeweg im Code. Die neue Strecke umgeht dessen Klassifikation, Workflows und Nachbearbeitung vollständig. Ein Fehler erzeugt keinen erfundenen Ersatztext.

Die Architektur benötigt keine Neukopplung von WhatsApp. Historienimport und Reaktionen bleiben vom automatischen Antwortversand getrennt.
