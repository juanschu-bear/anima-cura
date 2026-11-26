# Aus Gesprächen gelernt – Backendvertrag v1, 26.11.2026

## Trennung und Freigabe

`origin=practice`: bewusst angelegte/importierte Wissensbasis. `origin=conversation`: aus menschlichen Praxisantworten abgeleiteter, von der Praxisleitung freigegebener Wissenseintrag. Neue Gesprächsvorschläge stehen zunächst ausschließlich in der Vorschlagsablage, nicht im Retrieval. Praxishandy bedeutet Teamantwort; es wird nicht behauptet, Sabine persönlich habe jede Antwort geschrieben.

Neue Textantworten aus Praxishandy und AnimaDesk werden dauerhaft vorgemerkt. Nach zehn Minuten überträgt AnimaLine einen begrenzten Kontext (bis 20 Patiententexte und 20 Ausgangstexte aus 24 Stunden davor bis zehn Minuten danach). Automatische Antworten sind als solche gekennzeichnet, niemals Ziel der Lernextraktion. Gruppen, konfigurierte Team-/Nichtpatientennummern und bereits gelöschte Zielnachrichten werden ausgeschlossen. Bilder/Sprachnachrichten ohne Text werden nicht interpretiert. Initial sind vorhandene menschliche Ausgangstexte der letzten 30 Tage vorgemerkt; kein behaupteter vollständiger Import des alten WhatsApp-Archivs.

Der vorhandene Fünf-Minuten-Cron bearbeitet maximal drei Quellen pro Lauf. Fehler werden mit Rückstellung wiederholt, nach fünf Versuchen sichtbar gestoppt. Keine Verzögerung der Live-Antworten durch diese Verarbeitung. Nachrichten werden dabei weder beantwortet noch versendet. Die Extraktion läuft mit dem bestehenden Live-Modellzugang als betriebliche Hintergrundverarbeitung.

Namen und Kennungen werden vor der Extraktion entfernt. Jeder Vorschlag braucht exakte Zitate; Empfehlungen und Kommunikationsbeispiele müssen die menschliche Zielantwort belegen, Reaktionen einen Patiententext. Die Inhalte bleiben Entwürfe und können Fehler enthalten. `observation` beschreibt den Beleg, `interpretation` ist ausdrücklich eine mögliche Deutung oder null. Keine Antwort ist kein Zufriedenheitsbeleg. Medizinische Empfehlungen tragen `medical=true`; **jede** Freigabe verlangt serverseitig `admin`, auch wenn die Einstufung falsch wäre. Editieren oder Verwerfen ebenfalls nur Admin. Lesen: `admin` und `verwaltung`.

## AnimaDesk-Proxy (Claude)

Bestehender Sitzungs-/Same-Origin-Schutz unter `/api/animahost/control`, interne Weiterleitung nach Anima Cura. Browser liefert niemals `actorId`; der Proxy setzt die Sitzungs-ID. Kein Service-Key im Browser.

### Liste und Detail

`GET /api/animahost/control?resource=conversation_learning&page=0&state=draft&topic=appointment&kind=recommendation`

Alle Filter außer resource optional. `page` nullbasiert, Seitengröße 50. Detail: `&id=<UUID>`; liefert zusätzlich Audit. Antwort:

```json
{
  "origin":"conversation",
  "items":[{
    "id":"UUID","source_id":"UUID","version":1,"state":"draft",
    "origin":"conversation","topic":"appointment","kind":"communication",
    "payload":{
      "title":"Eine gezielte Rückfrage","content":"Allgemeiner Wissensvorschlag mit Anlass und Grenzen.",
      "occasion":"Unklarer Terminwunsch","observation":"Das Team stellt eine konkrete Rückfrage.",
      "interpretation":null,"medical":false,
      "evidence":[{"ref":"M1","quote":"Worum geht es?","messageId":"UUID","at":"ISO-Zeit"}],
      "origin":"conversation","extractionVersion":1
    },
    "source":{"id":"UUID","source":"practice_phone","source_at":"ISO-Zeit","chat_jid":"WhatsApp-Chatkennung"},
    "knowledge_id":null,"created_at":"ISO-Zeit","updated_at":"ISO-Zeit","reviewed_by":null,"reviewed_at":null
  }],
  "total":1,"nextPage":null,
  "summary":{"asOf":"ISO-Zeit","groups":[],"queue":[]},
  "audit":[],"failedSources":[]
}
```

Zusätzliche SQL-Zuordnungsfelder wie tenant_id/ordinal sind intern; für die Anzeige nicht erforderlich. `summary.groups` enthält je topic/kind/state `suggestions`, `reply_examples` (unterschiedliche menschliche Zielantworten), `chats`, `first_at`, `last_at`. Das sind **keine unabhängig gezählten Anliegen und keine Erfolgsquoten**. Gruppen nicht überlappungsfrei addieren. `summary.queue`: state, count, oldest_source. `failedSources`: id, source, source_at, last_error, attempts (maximal 50 älteste Fehler). Detail-Audit: version, actor_id, action, before_value, after_value, created_at. Zitate sind anonymisiert, die Chatkennung dient dem berechtigten Öffnen des ursprünglichen Chats. Referenzen bezeichnen interne Nachrichten-UUIDs, keine Baileys-IDs.

Feste Schlüssel:
- Vorschlag `state`: `draft`, `approved`, `rejected`.
- Quelle `state`: `queued`, `processing`, `done`, `error`.
- `kind`: `recommendation`, `communication`, `confusion`, `impatience`, `positive_feedback`, `correction`.
- `topic`: `appointment`, `appliance`, `pain`, `invoice`, `portal`, `documents`, `communication`, `other`.
- Quelle: `practice_phone`, `leitstand`; Kontext außerdem `patient`, `animahost`.

### Bearbeiten, Freigeben, Verwerfen

```json
{"action":"review_learning","id":"UUID","expectedVersion":1,"decision":"edit","entry":{"title":"Überarbeiteter Titel","content":"Überarbeiteter Wissensvorschlag"}}
```

`decision=approve` oder `reject` ohne entry. Antwort `{item: <aktualisierte Vorschlagszeile>, indexing: "scheduled" | "not_required"}`. Bearbeiten ausschließlich bei draft. Freigeben ausschließlich bei draft. Verwerfen bei draft oder approved; im zweiten Fall wird das veröffentlichte Wissen deaktiviert. Jede Aktion erhöht version und erzeugt einen Audit-Eintrag; veraltete expectedVersion liefert 409. 403 `learning_actor_forbidden`, 404 `learning_not_found`, 422 `learning_transition_invalid`, 503 bei nicht verfügbarer Verarbeitung. Texte bei Bearbeitung werden erneut anonymisiert; mögliche Änderungen daraus zeigt die zurückgegebene Zeile.

Freigabe erzeugt atomar einen versionierten Wissenseintrag (`knowledge_id`) mit Herkunft und Vorschlagsreferenz. Der reguläre Index-Sync macht ihn beim nächsten erfolgreichen Lauf nutzbar. Zurückgezogene Einträge fallen aufgrund der aktiven Wissensversion sofort aus Retrieval heraus, auch wenn ein alter Vektor noch gespeichert ist. Die bestehende allgemeine Wissens-API kann die Admin-Freigabe für Gesprächswissen nicht umgehen.

`POST {"action":"retry_learning_source","id":"UUID"}` setzt eine fehlgeschlagene Quelle zurück in die Warteschlange; Antwort `{queued:true|false}`. Nur Admin. Wiederholte Zustellung derselben Quell-ID überschreibt weder Kontext noch Bearbeitungsstand.

### Wissensbasis

`GET /api/animahost/control?resource=knowledge&origin=practice` beziehungsweise `origin=conversation`. knowledgeRecord liefert zusätzlich `origin` und `learningSuggestionId`. Ohne origin gilt die bestehende Liste mit beiden Herkünften. Das bestehende Feld `source` (`praxis`/`fachlich`/`offen`) bleibt in seiner bisherigen Bedeutung erhalten. Retrieval-Dokumente tragen origin und learningSuggestionId ebenfalls im payload.

## Betrieb und Migrationen

Anima Cura: `107_animahost_conversation_learning.sql`, Projekt zymqxzhjbcxzhzvjqvbv. AnimaLine: `20261126110000_learning_outbox.sql`, Projekt yucpobkmfvjsuuwtffvr. RLS; keine öffentlichen Leserechte. Interne Aufnahme unter `POST /api/animahost/whatsapp/internal/learning` ausschließlich mit bestehendem AnimaLine-Geheimnis und festem Praxis-Mandanten. Endpunkte sind keine Oberfläche; Claude baut deren Darstellung.

Prüfsummen siehe zugehörige `.sha256`-Dateien. Keine echten Patiententexte im Repository. Keine automatische Freigabe und kein automatisches Trainieren der Modellgewichte.

### Geschützter Betriebsaufruf

`POST /api/animahost/whatsapp/internal/learning/run` mit dem bestehenden AnimaLine-Geheimnis verarbeitet bis zu drei bereits gespeicherte Quellen. Kein Patienteneingang, keine Freigabe und kein Nachrichtenversand. Antwort `{processed, failed}`, bei technischem Abbruch 503 mit inhaltsfreiem Fehlercode. Der reguläre Cron führt Index-Abgleich und Lernverarbeitung unabhängig voneinander aus. Der Betriebsaufruf dient der gezielten Wiederaufnahme und Betriebsprüfung; keine Browser-Schnittstelle.
