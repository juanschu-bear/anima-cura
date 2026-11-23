# AnimaHost · Antwortkern, Prüfbericht und Wissensbasis

## Status und Bereitstellung

Der bestehende Empfang verarbeitet Notfälle, Abmeldungen und kontrollierte Aktionen wie Terminvermerke, Identitätsprüfung und Bescheinigungen. Der neue Antwortkern bearbeitet die übrigen Fragen mit freigegebenem Wissen, dem Verlauf und den geprüften Angaben zum Konto. Er schreibt keine Patientendaten und bucht keine Termine. Bis zu Juans Freigabe bleibt `ANIMAHOST_REPLY_CORE_PASSED` aus. Die Vorher/Nachher-Auswertung sendet keine Nachrichten.

Die Absenderprüfung erkennt Teamnummern, Gruppen, bekannte Nicht-Patienten und nicht zugeordnete Nummern. Team und Gruppen erscheinen unter „Wartet auf euch“. Die Regel `sender:identify` erlaubt einmalig eine Rückfrage ohne Aktenauskunft. `sender:unknown_handoff` zeigt die nächste Nachricht dem Team. Die Versandbrücke muss `senderPolicy: 1` mitgeben und `{skipSend:true}` beachten. Sie setzt `ANIMALINE_SENDER_POLICY=1` erst, wenn beide Dienste aktualisiert sind. Team- und Nicht-Patientennummern sind getrennte, kommagetrennte Einstellungen auf den Servern. Sie gehören nicht in Git oder API-Antworten.

## Wissensbasis im Leitstand

`GET /api/animahost/control?resource=knowledge[&id=<uuid>][&page=0]`. Sichtbar für `admin` und `verwaltung`. Die Antwort enthält `knowledgeAvailable`, `versions`, `effective` und `nextPage`. `versions` liefert bis zu 100 Versionen, gruppiert nach `id` und innerhalb der Gruppe absteigend nach `version`. `effective` enthält die aktuell zugelassenen Paare `{id,version}`. Eine unveröffentlichte Version ersetzt keinen freigegebenen Eintrag. Der Stichtag gilt in Berlin.

```ts
type KnowledgeDraft = {
  area: 'apparatur' | 'problem' | 'selbsthilfe' | 'warnzeichen' |
        'behandlungsphase' | 'praxisablauf' | 'begriff' | 'gespraech'
  title: string
  content: string
  source: 'fachlich' | 'praxis' | 'offen'
  validFrom: string // YYYY-MM-DD
  sources?: {key: string; name: string; url: string}[]
  guidance?: {selfHelp?: string; practice?: string; reception?: string; warningSigns?: string}
  openQuestion?: string | null
}

type KnowledgeVersion = KnowledgeDraft & {
  id: string
  version: number
  status: 'draft' | 'approved' | 'deactivated'
  active: boolean
  approvedAt: string | null
  approvedBy: string | null
  createdAt: string
  createdBy: string
  externalId: string | null
  hasOpenQuestion: boolean
  sourceApprovalNote: string | null
  importVersion: string | null
  importDate: string | null
}
```

`POST /api/animahost/control` nimmt die folgenden Aktionen an. Der Server ergänzt die authentifizierte Benutzer-ID. Die Browserseite sendet `actorId` nicht mit. Alle drei Aktionen liefern `{version: KnowledgeVersion}`.

| Aktion | Felder | Erfolg |
| --- | --- | --- |
| `save_knowledge_draft` | `{id:null,expectedVersion:0,entry}` zum Anlegen. Beim Bearbeiten die `id` und die aktuell letzte `version` angeben | 201 |
| `approve_knowledge` | `{id,expectedVersion}` für die letzte Entwurfsversion | 200 |
| `deactivate_knowledge` | `{id,expectedVersion}`. Beendet auch bereits freigegebene, zukünftige Fassungen desselben Eintrags | 200 |

Bei `409 knowledge_version_conflict` die Versionen neu laden. `422 knowledge_not_draft` oder `knowledge_not_active` erklärt eine unzulässige Aktion. `403` steht für fehlende Berechtigung. `503 animahost_unavailable` weist auf ein technisches Problem hin. Eine fehlende Migration liefert beim Lesen `knowledgeAvailable:false`.

`POST /api/animahost/control` mit `{action:'import_kfo_knowledge'}` importiert die mit dem Server bereitgestellte JSON-Datei `docs/animahost/wissensbasis-kfo-v1.json`. Es gibt keinen Upload aus der Browseransicht. Rückgabe `200 {fileVersion,fileDate,created,revised,unchanged,openQuestions}`. Der Eintrag behält seine feste `id`, abgeleitet aus dem fachlichen `externalId`. Identische Importdaten ergeben keine weitere Version und überschreiben keine Änderung der Praxis. Geänderter Inhalt, eine geänderte Quellenangabe oder ein neuer Stand der Datei erzeugen eine neue Entwurfsfassung. Die gesamte Datei wird in einer Transaktion verarbeitet. Ein Importversuch vor Migration 104 liefert `503 knowledge_import_not_installed`.

Alle 51 Zeilen der Fassung v1.2 starten als `draft` mit `active:false`, `approvedAt:null` und `approvedBy:null`. `sourceApprovalNote` übernimmt einen Freigabevermerk aus der Datei als Herkunftshinweis. Für die Modellfreigabe gilt der gesonderte Klick der angemeldeten Praxis. `effective` zeigt die zum aktuellen Berliner Stichtag für das Live-Modell wirksamen Paare. Ein Datum in der Zukunft wirkt erst ab diesem Tag. Beim Deaktivieren bleibt die vollständige Historie erhalten. Neue Freigaben wirken ohne Bereitstellung.

`GET /api/animahost/control?resource=knowledge_open_questions` liefert `{knowledgeImportAvailable,questions}`. `questions[]` enthält `{id,externalId,version,area,title,question}` aus der jeweils jüngsten Fassung. `hasOpenQuestion` steht auch an der normalen Zeile. Die Frage wird mit einem versionierten Entwurf geändert und mit `entry.openQuestion:null` als geklärt entfernt. Ausgelassene Metadaten bleiben erhalten. Ein übergebenes `entry.guidance` ersetzt das bisherige Objekt. Der Text der offenen Frage und die redaktionelle Freigabenotiz werden dem Modell nicht als Wissen angeboten.

## Welche Quellen eine Antwort belegen

`POST /api/animaline/replay` ist der bestehende Probelauf im Leitstand für `admin`. Für die Antwort liefert Anima Cura jetzt `rulebookVersion`, `knowledgeAvailable` und `result.usedKnowledge`. Jeder Beleg ist `{id,version,claim}`. `claim` ist die Aussage im geprüften Antworttext. Ein zweiter Aufruf prüft die Belege gegen die verwendeten Versionen. Die Detailansicht lädt die betreffende Fassung über `resource=knowledge&id=...`. Allein das Laden eines Wissenseintrags macht ihn noch nicht zum Beleg.

Der optionale Parameter `knowledgeMode:'draft_preview'` nutzt für den Probelauf den gebündelten Entwurf aus der JSON-Datei. Die Antwort kennzeichnet das mit `knowledgeMode:'draft_preview'` und `knowledgeFileVersion`. Die Belege beziehen sich in diesem Modus auf die unveränderliche Dateifassung mit `version:1` als Kennung für den erstmalig eingelesenen Entwurf. Die Zuordnung zu `externalId` erfolgt über die stabile ID. Die normale Einstellung `approved` liest ausschließlich wirksame Freigaben aus der Datenbank. Der Live-Versand hat keinen Zugang zum Entwurfsmodus.

Der Bericht verwendet pro Nachricht `eventId`, `origin` (`live` oder `archive`), `at`, `before`, `beforeSource`, `after`, `status`, `rulebookVersion`, `usedRuleIds` und `usedKnowledge`. `beforeSource` unterscheidet die im Versand gespeicherte Antwort, einen Versandbeleg ohne separate Textzeile und die erste historische Antwort. Fehlt ein belastbarer Bezug zu einer Antwort, ist `before:null`. Bei einem abgelehnten Entwurf ist `after:null`. `violations` und `ms` erklären die Ablehnung und die Rechenzeit. Für Regelbuch und Fachwissen verwendet der Probelauf den zum Prüftag verfügbaren Stand. Die Zeitangaben zur Rückmeldung werden aus dem Empfangszeitpunkt der Nachricht berechnet.

## Tägliche Antwortqualität

`GET /api/animaline/chats?quality=1&day=YYYY-MM-DD`. Praxisrollen `admin` und `verwaltung`. Der Tag endet zur Berliner Ortszeit. Das Feld `items` nennt die prüfbaren Fälle mit `{eventId,at,quality,rule,messageType,replySent}`. `&eventId=<uuid>` gibt für einen Fall dieses Tags zusätzlich `message` mit `receivedText` und `sentText` zurück. Diese beiden Texte sind nur für das Praxisteam und gehören weder in die allgemeine Übersicht noch in den anonymisierten Ergebnisbericht.

Die Antwort liefert `counts` für `content`, `handoff_only`, `no_reply`, `unrated`, `pending`, `practice_reply` und `excluded`. `withoutContent = handoff_only + no_reply`. `assessed = content + withoutContent`. `withoutContentRate` ist der Anteil an den bewerteten Fällen zwischen 0 und 1 und bei leerem Nenner `null`. Fälle ohne belastbaren Inhaltsnachweis sind `unrated`. Praxisantworten, Testfälle, Gruppen und fremde Nummern sind keine automatische Patientenstrecke. Die Zuordnung bezieht sich auf die aktuell im Leitstand bestätigten Patientenverknüpfungen. Bei alten Vorgängen fehlen einzelne Angaben zur Antwortqualität. Die Zahlen für `unrated` sind daher immer mit anzuzeigen.

## Offene Fragen für den Praxisfragebogen

- Für welche Geräte und Situationen soll das Mitbringen eines gelösten Teils empfohlen werden? Die Praxis legt den Wortlaut je Fall fest.
- An welchen Tagen und zu welchen Zeiten bietet die Praxis bei Problemen mit einem Gerät einen spontanen Besuch an? Was gilt bei Schließtagen und ausgebuchter Sprechstunde?
- Bei welchen Anliegen soll der Patient zwischen festem Termin, Besuch mit Wartezeit und Rückruf wählen können? Wer übernimmt den Rückruf, wenn ein Anliegen besonders dringend ist?

Solange für eine Option keine freigegebene Quelle vorliegt, bekommt die Praxis den offenen Teil der Frage.
