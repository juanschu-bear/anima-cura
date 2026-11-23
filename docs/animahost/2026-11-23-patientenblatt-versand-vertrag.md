# Patientenblatt, Chat-Zuordnung und geplanter Versand — Vertrag für Claude
Stand: 23.11.2026. Backend vorbereitet; neue Antwortstrecke bleibt bis Juans Freigabe aus. Keine Nachtpause.

## Geplanter Versand
`GET /api/animaline/chats` liefert in Liste und Detail zusätzlich `plannedReply: null | {id, chat_jid, source_event_id, send_at, reason, state, created_at}`.
`state`: `planned` oder `sending`; Zeiten ISO UTC, im Leitstand lokal darstellen. `reason`: `{kind: "reading_and_writing" | "emergency", readSeconds, writeSeconds, delaySeconds, generatedAfterTarget, nightRestriction:false}`.
Neue Kategorie `scheduled` für die wartende Antwort. Nicht als bereits versendet darstellen. Nach Versand gelten die bisherigen Versandstände. Neue Patientennachricht ersetzt den Plan; deshalb beim Aktualisieren immer die aktuelle Plan-ID verwenden. Ein unklarer Versand wird zur Prüfung gehalten und niemals automatisch erneut geschickt.
Normalziel 30–90 Sekunden ab Eingang, Notfallziel 10–15 Sekunden. Erzeugungszeit zählt mit; bei Überschreitung des Ziels sofort nach Fertigstellung und `generatedAfterTarget:true`. Keine Tageszeitbeschränkung.

## Verwendetes Patientenblatt
Entscheidungsdetails `patientSheet` sowie Antwortbeleg `timings.patientSheet`: `{access, asOf, fields}`. `access`: `confirmed | unconfirmed | ambiguous | unlinked`. Je Feld `filled | empty | unavailable`; nicht verfügbar bedeutet ausdrücklich nicht „nicht vorhanden“. Nur Feldbelegung wird protokolliert, keine Kopie vertraulicher Akteninhalte.
Entscheidungsdetails `chatName`: `{status: matched|ambiguous|unmatched, matchedName?, patientId?, question, source?:chat, confirmed?, candidateIds?}`. Kandidatenkennungen nicht als sichtbaren Text ausgeben.
Patientenblatt umfasst schreibende Person/Kind, Apparatur/Phase, Termine samt relativen Tagen, versäumte/verschobene Termine, Rechnungsakte/Zustellung/Portal, Guthaben, bisherige Anliegen, Klärfälle und Teamnotizen, soweit aus vorhandenen Quellen verfügbar. Rechnungsdaten werden ausschließlich lesend über vorhandene Patientensicht bezogen.

## „Per Chat zugeordnet“ bestätigen oder lösen
`GET /api/animahost/control?resource=chat_identity_links&patientId=<uuid>`: `links` mit `id, chat_jid, phone, matched_name, status, created_at, updated_at, decided_by`. Status `provisional`, `confirmed`, `released`.
`POST /api/animahost/control`: `{action:"decide_chat_identity", linkId:"<uuid>", confirm:true}` bestätigt; `confirm:false` löst. Bestehende Sitzung und Rolle admin/verwaltung erforderlich; Actor wird serverseitig eingesetzt, niemals aus dem Browser übernommen.
Vorläufige Namenszuordnung erlaubt allgemeine Hilfe und Namensansprache, aber keine vertraulichen Rechnungs-, Behandlungs- oder Dokumentdaten. Stammdaten/Telefonnummern werden dadurch nicht überschrieben. Die Oberfläche baut Claude.
