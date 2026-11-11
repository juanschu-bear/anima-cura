# Scribe Schritt 1: Zeitmaschine, Infobox und gemeinsame Glocke

Stand 10.11.2026. Backend in anima-cura; die sichtbare Oberfläche baut Claude. Keine .tsx/.css-Änderung für diesen Auftrag.

## Bereitstellung und Voraussetzungen

Migration `078_scribe_time_machine_inbox_bell.sql` muss **vor** dem Backend-Deployment installiert sein. Freigabe mit endgültiger Prüfsumme separat. Bis dahin kein Production-Rollout dieses Changesets: neue Schreibwege benötigen die Tabellen/Funktionen. Bestehende Daten bleiben erhalten, das alte Inbox-JSON wird als unveränderte Migrationsquelle eingefroren. Ab Cutover darf kein alter Prozess mehr `scribe_praxis_inbox` schreiben.

Umgebungsvariablen (nur serverseitig):

- `SCRIBE_INBOX_EMAIL_TO`: Juans Empfängeradresse. Juan trägt sie in Vercel ein. Nutzt den vorhandenen Mailversand, keinen neuen Provider.
- `SCRIBE_DEVELOPER_USER_ID`: UUID von Juans **persönlichem** Anmeldekonto. Keine automatische Gleichsetzung mit Rolle `admin`. Ohne bestätigte UUID keine Entwicklerrechte für irgendein Praxiskonto.
- `SCRIBE_SYSTEM_TOKEN`: eigenes starkes Geheimnis für Entwicklungsautomatik; `Authorization: Bearer …` nur serverseitig. Gilt für Inbox-PATCH, Update-POST und Mail-Retry, nicht für Patientendokumentation. Niemals an Browser liefern.
- Bestehender `CRON_SECRET`: schützt den Wiederholungsversuch für nicht zugestellte Inbox-Mails alle fünf Minuten.
- `SCRIBE_PRAXIS_ID`: bestehender Scope, Standard `praxis-schubert`. Migration registriert diesen und bereits vorhandene Praxis-Scopes.

Neue Fehlerantworten: `{code, error, message}`. `code` ist stabil maschinenlesbar; `error`/`message` sind lesbarer Text. Alle schreibenden Benutzer werden gegen `user_profiles` geprüft, nicht gegen frei änderbare User-Metadaten. Patienten sind ausgeschlossen.

## 1. Vorlagen laden und feste Indizes erhalten

**Neue Oberfläche:** `GET /api/doku/vorlagen?history=1` (normaler Login; bestehender Praxispass-Token weiterhin nur zum Lesen). Antwort `{vorlagen, templateErrors, capabilities, templateHistoryVersion:1}`. Bestehende Felder bleiben erhalten. Jede `struktur.groups[g].opts[i]` enthält zusätzlich:

```ts
{
  t: string,
  optionKey: string,             // dauerhaft, nicht aus t oder aktueller Sortierung ableiten
  origin: 'vorlage' | 'praxis',
  hidden: boolean,
  lastChangeId: string | null,
  editable: boolean,             // false bei abrechnungsgebundener oder expliziter Gruppe
  id?: string,                   // bisherige Praxis-Text-ID
  quelle: 'seed' | 'praxis',
  on?: boolean
}
```

`templateErrors` isoliert beschädigte Vorlagen, statt Scribe insgesamt zu blockieren:

```ts
Array<{
  templateId: string,
  code: 'template_layout_changed',
  behandlungsart: string | null,
  terminTyp: string | null
}>
```

Die betroffene Vorlage fehlt in `vorlagen`; alle übrigen bleiben benutzbar. Claude zeigt für jede betroffene Vorlage eine nicht verwerfende Meldung „Vorlage muss geprüft werden“ und bietet sie nicht zur Dokumentation an. Die Oberfläche darf den Fehler nicht als globalen Ladefehler behandeln.

**Array niemals filtern oder umsortieren, bevor Auswahlindizes gebildet werden.** In der Darstellung `opts.map((opt,i) => opt.hidden ? null : …)`. Keine Vorauswahl ausgeblendeter Optionen; sie kommen mit `on:false`. Gespeicherte Auswahlindizes und Positionsbedingungen beziehen sich auf die ursprünglichen Plätze. Feste Optionen behalten ihren Seed-Index. Beim Start behalten aktive Praxistexte ihre bisherige Reihenfolge; bisher ausgeblendete Texte bekommen dahinter feste Plätze. Neue Praxistexte werden nur hinten angefügt.

Bei jedem neuen Entwurf, Speichern, Bestätigen und jeder Tagesdatensatz-Korrektur aus diesem Vorlagenstand **`variablen.template_history_version = 1`** mitschicken bzw. im Tagesdatensatz `variables.template_history_version = 1`. Das wird mit dem Eintrag gespeichert und sorgt dafür, dass die serverseitige Konsistenzprüfung denselben Stand und dieselben Indizes verwendet. Bereits vorhandene Einträge behalten ihre Texte unverändert. Bei historischen Entwürfen ohne diese Versionsmarkierung nicht einfach die bisherigen Praxis-Indizes auf den neuen Katalog anwenden; neu auswählen oder im bisherigen Modus fertigstellen.

Ohne `history=1` bleibt der bisherige API-Modus für das aktuell ausgelieferte Cockpit erhalten. Dadurch tauchen die 200 bisher ausgeblendeten Multiband-Texte nicht plötzlich in alten Cockpits auf. **Zeitmaschinen-Verwaltung und der neue Lesemodus gemeinsam ausrollen.** Alte offene Cockpits danach neu laden; sie kennen geänderte feste Texte noch nicht. Neue Funktionen nicht mit dem Legacy-Lesemodus mischen.

Vorlagenstand zu Beginn jeder Bearbeitung laden. Ändert die Praxis einen Text während jemand dokumentiert, kann dessen Bestätigung wegen Text-/Auswahlkonflikt blockieren. Text nicht verwerfen; neu laden, vergleichen und bewusst übernehmen. Keine nachträgliche Änderung bestätigter Dokumentationen durch die Zeitmaschine.

Bestätigte Einträge werden beim Abrechnungsexport unabhängig von der Versionsmarkierung gegen den Vorlagenstand zu `bestaetigt_am` geprüft. Spätere Umbenennungen und Ausblendungen ändern deshalb keinen bereits bestätigten Beleg. Neue Entwürfe und Bestätigungen verwenden weiter den aktuellen Stand.

Der Praxis-Pass darf bei bestehenden Vorlagen nur Metadaten und Reihenfolge übernehmen. Weichen feste Bausteine ab, antwortet `POST /api/praxis-pass` mit `409`:

```ts
{
  code: 'template_structure_change_requires_history',
  error: string,
  templates: Array<{
    templateId:string,
    behandlungsart:string,
    terminTyp:string,
    code:'template_structure_change_requires_history'
  }>
}
```

Claude verweist dann auf die Zeitmaschine. Direkte spätere Datenänderungen an den festen Optionsarrays werden zusätzlich in der Datenbank abgelehnt. Dadurch können `positionen[].if.i` und gespeicherte Auswahlindizes nicht still auf andere Bausteine rutschen. Neue eigene Terminvorlagen dürfen weiterhin vollständig angelegt werden.

## 2. Zeitmaschine-Endpunkte

`GET /api/doku/vorlagen/changes?templateId=<UUID>&beforeSeq=<optional>`

```ts
{
  revision: number,              // aktuelle Revision der gesamten Vorlage/Praxis
  changes: Array<{
    id: string, seq: number, template_id: string, praxis_id: string,
    behandlungsart: string, termin_typ: string, gruppe: string, option_key: string,
    action: 'hide'|'show'|'rename'|'restore_practice'|'undo'|'restore_at',
    before_state: {text:string, hidden:boolean},
    after_state: {text:string, hidden:boolean},
    actor_id: string, actor_name: string, created_at: string,
    reverses_id: string|null, request_id:string
  }>,
  nextBeforeSeq: number|null,     // 100 Einträge je Seite
  historyAvailableFrom: string|null,
  deletedPracticeOptions: Array<{
    option_key:string,template_id:string,gruppe:string,option_index:number,
    source:'praxis',practice_option_id:string,
    baseline:{text:string,hidden:boolean},state:{text:string,hidden:boolean},
    last_change_id:string|null,created_at:string
  }>
}
```

`POST /api/doku/vorlagen/changes`

```ts
{
  templateId: string, requestId: string, expectedRevision: number,
  action: 'hide'|'show'|'rename'|'restore_practice'|'undo'|'restore_at',
  optionKey?: string, // hide/show/rename/restore_practice
  text?: string,      // rename, 1–400 Zeichen
  changeId?: string,  // undo
  at?: string         // restore_at, ISO-Zeitpunkt mit Zeitzone
}
// -> {ok:true,revision:number,changeIds:string[]}
// Bei nötiger zweiter Bestätigung antwortet der Server mit HTTP 409 und
// `code:'template_change_confirmation_required'`; die Oberfläche zeigt den
// vorgeschlagenen neuen Text und sendet danach dieselbe Anfrage mit
// `confirmProtected:true`, `confirmationFingerprint` und `confirmedBy` erneut.
```

- Eine Nutzeraktion bekommt eine UUID `requestId`; bei Netzfehlern **identische** Anfrage erneut senden. Andere Daten mit derselben UUID: `409 idempotency_conflict`.
- Veraltete Revision: `409 template_revision_stale`. Neu laden, nicht still übergehen.
- Rückgängig macht einen **neuen** Verlaufseintrag. Nur die letzte Änderung des betroffenen Bausteins kann einzeln rückgängig gemacht werden; sonst `409 change_superseded`. Auch ein Rückgängigmachen kann wieder rückgängig gemacht werden.
- Zeitpunkt wiederherstellen setzt alle Plätze der Vorlage in einer Transaktion zurück und erzeugt neue Einträge. Nach dem Zeitpunkt neu hinzugekommene Texte werden ausgeblendet, nicht gelöscht. Vor dem ersten gesicherten Stand: `409 history_time_unavailable`.
- Gruppen mit irgendeiner `positionen[].if.g`-Regel sowie `explizit:true`: Änderung ist nach zweiter Bestätigung zulässig. Die 409-Antwort enthält je betroffenem Baustein bisherigen/neuen Text und angehängte Positionen; die Bestätigung wird im Änderungsbuch mit Name und Zeit festgehalten. Ist eine Änderung technisch unmöglich, antwortet der Server mit `422 template_last_required_option` bzw. `template_change_not_possible` und einem Vorschlag. `403 template_group_protected` ist für diese Praxisänderung nicht mehr zulässig. Unverändertes Wiedereinblenden eines vorhandenen Praxistextes ist zulässig.
- Weitere Codes: `input_invalid` (400), `option_not_found`, `change_not_found` (404), `not_practice_option` (400), `template_layout_changed` (409), `scribe_workspace_unavailable` (503).
- Alle Aktionen verlangen Schreibrecht in Scribe: Nicht-Patientenrolle plus `permissions.scribe_schreiben`, sonst Rollenstandard admin/verwaltung. Gleiche Rechte für Undo und Wiederherstellung.

Bestehende `POST /api/doku/optionen` bleibt für neue Praxistexte. `PATCH /api/doku/optionen {id,aktiv}` wird über dieselbe Hausregel und Verlaufsschreibung abgewickelt; optional `requestId`, `expectedRevision`. Für neue UI den expliziten Zeitmaschinenvertrag bevorzugen. `GET /api/doku/optionen` liefert weiterhin aktive/inaktive Originaldatensätze; aktuelle Umbenennungen ausschließlich aus der neuen Vorlagenprojektion lesen.

**Bestandsbefund:** Am 10.11.2026 sind 200 Multiband-Praxistexte inaktiv, nicht nur rund 80. Es wird nichts automatisch eingeblendet. Historische Löschzeit und löschende Person wurden vorher nicht protokolliert; diese Angaben werden nicht erfunden. Alle noch vorhandenen Texte sind über ihren Vorlagenbezug wiederherstellbar. Für deaktivierte Terminvorlagen zunächst die Vorlage wieder aktivieren.

## 3. Infobox

Bestehender Pfad `/api/scribe/inbox`, bisherige Feldnamen bleiben erhalten.

- GET: `{eintraege,offenHeute,heute,unreadCount,team,currentUserId,canManageTeam,canSetDeveloperStatus,storageReady}`. Jeder Eintrag zusätzlich `revision`. `status`, `status_zeitpunkte`, `status_verlauf[].geaendert_von_name`, `kommentare`, Erwähnungen und Zwischenlösung bleiben kompatibel.
- POST: bisher `{art,titel?,text,kategorie?,prioritaet?,bereich?,erinnerung?,assigned_to?}`. Antwort `201 {ok:true,eintrag,mail:{status:'sent'|'pending'|'unchanged',…}}`. **Gespeichert und Mail erfolgreich sind verschiedene Zustände.** Bei `pending` nicht erneut denselben Eintrag anlegen.
- PATCH: bisherige Felder plus optional `revision` (neue UI immer senden). `{id,revision,status?,kommentar_text?,mention_user_id?,mark_mentions_read?,praxis_bestaetigt_von?,zwischenloesung?,assigned_to?}`. Antwort `{ok:true,eintrag}`.
- DELETE `{id}`: nur eigene Einträge. Softdelete; Verlauf und Kommentare bleiben erhalten. Andere Ersteller: `403 inbox_delete_forbidden`.

Nur Juans explizites Entwicklerkonto oder die serverseitige Systemauthentifizierung darf `untersucht`, `fix_in_arbeit`, `bereitgestellt` sowie Rücksprünge auf `bestaetigt` setzen. Rolle `admin` allein genügt nicht. Praxis darf kommentieren und bei `bereitgestellt` abschließend `praxis_bestaetigt` mit Personenname setzen. Zuvor `409 inbox_not_ready`; Entwicklerstatus ohne Recht `403 inbox_developer_required`. Zuweisung und Zwischenlösung werden ebenfalls entwicklerseitig verwaltet. Konflikt: `409 inbox_revision_stale`, erneut laden statt überschreiben. Gleichzeitige Kommentare können sich nicht gegenseitig überschreiben.

Vorher: 8 Einträge, 2 explizit gespeicherte Statusereignisse, 0 Kommentare. Die Migration übernimmt alle Rohfelder und den vorhandenen Verlauf ohne neue historische Ereignisse zu erfinden. Keine Mails und keine Glockenmeldungen durch die historische Übernahme.

## 4. Glocke in Scribe und später im Leitstand

`GET /api/practice-notifications?offset=0&lang=de`

```ts
{
 notifications:Array<{
   id:string,kind:'wunsch_status'|'antwort'|'update'|'wichtig',
   title:string,text:string,link:string,createdAt:string,readAt:string|null
 }>,
 unreadCount:number,total:number,nextOffset:number|null,currentUserId:string
}
```

50 je Seite; Gesamtzahl ungelesen wird über alle sichtbaren Meldungen gezählt. Links sind lokale App-Pfade (`/scribe?inbox=<id>`, `/scribe?update=<id>`). Claude öffnet dazu die richtige Infobox/Update-Karte. Im Leitstand diese Links gezielt auf die Scribe-Origin oder eine eigene passende Route abbilden; kein blindes externes Redirect.

`PATCH /api/practice-notifications {action:'read',id}` bzw. `{action:'read_all',createdBefore?:ISO}` → `{ok:true,markedRead:number}`. „Alle gelesen“ betrifft nur die zum Stichtag sichtbaren Meldungen. Später eingehende Meldungen bleiben ungelesen. Fremde oder unsichtbare ID: `404 notification_not_found`.

Datenbankvertrag für Leitstand (gleiche Konten/Anmeldung):

- `public.practice_notifications`: `recipient_id` **oder** `recipient_role`; Inhalt, Quelle und Sichtbarkeitszeitraum.
- `public.practice_notification_reads`: `(notification_id,user_id,read_at)`; Lesen einer Rollenmeldung gilt nur für das handelnde Konto.
- Angemeldeter Supabase-Client: SELECT auf beiden Tabellen wird durch RLS auf das eigene Praxiskonto begrenzt. Patienten und anonyme Nutzer erhalten keine Meldungen. Lesenmarkierung über RPC `practice_mark_notifications(p_id uuid|null,p_before timestamptz)` unter **authenticated**, niemals mit fremder User-ID.
- Keine Zugriffsrechte für `abrechnung_runtime` hinzugefügt. Falls Leitstand ausschließlich diese eingeschränkte Verbindung verwendet, muss sein BFF den Sitzungskontext mit dem authentifizierten Client verwenden; nicht ungeprüft auf Service-Role ausweichen.

Automatische Meldungen: Statuswechsel und Kommentare an den ursprünglichen Ersteller, auch mehrere Ereignisse in einer Anfrage getrennt. Updates aus `/api/praxis-updates` beim erstmaligen Veröffentlichen an die angegebenen Praxisrollen (Standard alle drei); keine Meldung für Entwürfe, zukünftige Sichtbarkeit wird beachtet. POST dort jetzt nur Entwickler/System. Der bestehende Update-Lese-/Bestätigungsstand bleibt unabhängig vom Lesen der Glocke.

Der handelnde Nutzer erhält keine Meldung über den eigenen Kommentar oder die eigene finale Praxisbestätigung. Andere berechtigte Empfänger und bestehende Lesestände bleiben unverändert.

## 5. Mail-Auslöser

Inbox-Speicherung und Mailauftrag sind eine Transaktion. Der bestehende App-Mailweg wird danach aufgerufen; eine Lease verhindert parallelen Versand. Ein stabiler Provider-Idempotenzschlüssel verhindert Doppelversand bei Wiederholung. Keine wechselnden Tracking-Links in diesen Mails. Die Mail enthält nur den Hinweis und den authentifizierten Link, keine medizinischen Freitexte.

`POST /api/scribe/inbox/mail-retry` ist nur für Entwickler/System. Bestehender Cron ruft alle fünf Minuten `GET /api/cron/scribe-inbox-mail` mit `CRON_SECRET` auf. Fehler werden im Mailauftrag gespeichert. Höchstens zehn Versuche; nach Ablauf des Provider-Idempotenzfensters kein unkontrollierter erneuter Versand, sondern manuelle Prüfung. Keine echte Testmail ohne gewählten Empfänger.

## 6. Abnahme

Automatisierte PostgreSQL-Tests prüfen: alte/inaktive Texte, feste Indizes, Umbenennen, Aus-/Einblenden, Undo/Redo, Zeitpunkt-Restore, unveränderliche Historie, Revisions-/Idempotenzkonflikte, geschützte Gruppen, Patienten-/Leserechte, Legacy-Inbox-Erhalt, Entwicklerstatus, finale Praxisabnahme, Kommentare/Bells, eigenes Löschen, Mailaufträge/Lease und Rollenmeldungen mit getrennten Leseständen. Bestehende Scribe-Tests und vollständiger Build zusätzlich.

Für UI-Abnahme: in freier Gruppe umbenennen → ausblenden → rückgängig → nach Zeitpunkt wiederherstellen; in Abrechnungsgruppe 403 korrekt als Wunsch anzeigen; Text eines alten bestätigten Eintrags bleibt unverändert; eigener/fremder Glocken-Lesestand; Praxis sieht Bearbeitungsstatus, kann ihn aber nicht als Entwickler setzen.


## Rollout-Nachtrag 10.11.2026

Production: 079 als fehlende Schema-Voraussetzung und danach unveränderte 078 erfolgreich installiert und geprüft. Backend `d73be89` ist auf main und live. 8/8 Inbox-Einträge exakt übernommen, 2.243 Bausteinplätze, 200 archivierte Multiband-Praxistexte. Die UI kann auf diesem Vertrag aufbauen; Vorlagenmodus und Versionsmarkierung gemeinsam aktivieren.

Juans persönlicher interner App-Zugang ist `juan@praxis-schubert.de`; `SCRIBE_DEVELOPER_USER_ID` ist auf dessen UUID `e5702286-8d03-4f4f-8220-92cefed44075` gesetzt. Es ist kein E-Mail-Postfach. Echte Mailhinweise warten noch auf `SCRIBE_INBOX_EMAIL_TO`. Kein bestehendes Teamkonto erhielt Entwicklerrechte.

## Absicherungs-Nachtrag 11.11.2026

Migration `080_scribe_time_machine_safeguards.sql` schützt feste Bausteinplätze auch vor direkten Strukturänderungen und unterdrückt Selbstbenachrichtigungen. Vor dem Production-Einspielen gelten erneut Prüfsummenfreigabe und kontrollierte Prüfung. Der Backend-Rollout folgt erst nach erfolgreicher Installation, weil der Praxis-Pass sonst noch nicht auf Datenbankebene abgesichert wäre.

## Planänderung Juan 11.11.2026 — ersetzt die bisherigen Absicherungsregeln

Die Praxis darf nicht an Juan hängen. Scribe speichert den eingegebenen Text immer zuerst, zeigt bei einem Prüfungsproblem den verständlichen Hinweis und einen Vorschlag und lässt die Praxis nach einer zweiten Bestätigung fortfahren. Die zweite Bestätigung wird mit Name und Zeit in der Akte festgehalten. Systemfehler werden automatisch abgefangen; der Praxistext wird nie verworfen.

### Praxis-Pass und Bausteine

`POST /api/praxis-pass` lehnt eine Praxis-Pass-Absendung wegen Bausteinen nicht mit 409 ab. Metadaten, Reihenfolge und neue Terminarten werden wie bisher gespeichert. Feste Bausteine werden über die Zeitmaschine mit stabilen `optionKey`-/Indexwerten übernommen. Bei einer Abrechnungskopplung antwortet der Server mit HTTP 200 und `code:'template_change_confirmation_required'`, damit die Oberfläche je Änderung zeigt:

```ts
{
  templateId:string, optionKey:string, gruppe:string,
  before:{text:string,hidden:boolean}, after:{text:string,hidden:boolean},
  positions:Array<{code:string,text?:string,anzahl?:number}>,
  confirmationFingerprint:string
}
```

Der zweite Aufruf sendet `confirmProtected:true`, `confirmationFingerprint` und `confirmedBy` (Name aus der Sitzung, nicht aus dem Browser). Die Antwort enthält `confirmationRecorded:true`. Der Änderungsbucheintrag bewahrt vorherigen/neuen Text, Positionen, Name und Zeit. `POST /api/doku/vorlagen/changes` verwendet denselben Vertrag; `template_group_protected`/403 ist für diese Praxisänderung nicht mehr zulässig. Kann die letzte sichtbare Auswahl einer expliziten Pflichtgruppe nicht ausgeblendet werden, antwortet der Server mit HTTP 422, `code:'template_last_required_option'` und `suggestion:{kind:'rename_instead'}`. Eine nicht auflösbare Vorlage wird mit `code:'template_change_not_possible'` plus Vorschlag gemeldet, nicht still geändert.

### Prüfungen beim Eintrag und Tagesdatensatz

Die erste Bestätigung mit Prüfungsproblemen liefert HTTP 422 (bei nicht lesbarer Quelle HTTP 503), `code:'consistency_confirmation_required'`, `consistency:{required:true,fingerprint,issues,suggestions}`. Der erneute identische Auftrag ergänzt `consistencyAcknowledgement:{fingerprint}`. Bei Erfolg enthält die Antwort `confirmation` und `confirmationLabel:'Trotz Hinweis von <Name> bestätigt'`; der Audit steht in `variablen._consistencyConfirmation` bzw. im Tagesdatensatz. Das gilt auch für „Positionen kopieren“. Bei Tagesdatensatz-Entscheidungen wird der Audit als `p_consistency_audit jsonb` an `decide_doku_day_part` übergeben und in derselben SECURITY-DEFINER-Transaktion wie der kanonische Text und die Version gespeichert. Es gibt keinen nachgelagerten service_role-UPDATE mehr, der den 076-Kanonwächter auslösen könnte. Der Server wiederholt jede `*_read_failed`-Quelle genau einmal, bevor er 503 oder die Bestätigung anbietet. Ein technisch nicht speicherbarer Fall liefert `code` und den automatischen Alternativvorschlag.

Der Abrechnungsexport bleibt nutzbar: Er liefert bei späteren Prüfproblemen HTTP 200 mit `consistencyWarnings`, `confirmation` und `confirmationLabel`, statt den bestätigten Eintrag zu verlieren.

### Beschädigte Vorlagen

`GET /api/doku/vorlagen?history=1` liefert jede `templateErrors`-Vorlage weiter nutzbar im bisherigen Modus: `usable:true`, `templateHistoryMode:'legacy_fallback'`, `sendTemplateHistoryVersion:false`. Sichere automatische Platznachführung erfolgt selbst; andernfalls bleiben die bisherigen Plätze und die Versionsmarkierung wird weggelassen. Es gibt keine Meldung an Juan. „Positionen kopieren“ bleibt möglich. Fehlerfreie Vorlagen tragen `templateHistoryMode:'versioned'`.

### Stabile Antwortcodes

Alle Scribe-Fehlerantworten behalten ihren deutschen Text, liefern aber einen stabilen `code`: `draft_not_found` („Entwurf nicht gefunden“), `draft_not_editable` („Nur Entwuerfe koennen weiterbearbeitet werden“), `patient_ivoris_id_missing` („Patient hat keine ivoris_id“), `text_required` („text fehlt“), `scribe_forbidden` („Keine Berechtigung“) und `not_authenticated` („Nicht autorisiert“). Neue Vorschläge sind zusätzliche Felder und ersetzen diese Sätze nicht.

### Datenbank-/Rolloutstand

080 wurde für diese Regeln angepasst und ist noch nicht in Production. Die neue SHA-256-Prüfsumme ist nach dem Branch-Push mitzuteilen; Production-Einspielen erfolgt erst nach Juans erneuter Freigabe.
