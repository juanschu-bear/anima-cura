# WhatsApp-Reaktionen im Leitstand

`GET /api/animaline/chats?chatJid=<chatJid>&historyPage=0` liefert die Erweiterung in der Chatansicht für Praxisleitung und Verwaltung. Dieselben Rechte und dieselbe Verlaufspaginierung gelten weiter.

```ts
type ChatReaction = {
  kind: 'reaction'
  messageId: string       // ID der Reaktion
  targetMessageId: string // messages[].messageId der Ursprungsnachricht
  emoji: string | null    // null bei entfernter Reaktion
  direction: 'incoming' | 'outgoing'
  operation: 'set' | 'remove'
  at: string              // ISO-8601
}

type ChatDetailExtension = {
  messages: Array<ExistingChatMessage & { reactions: ChatReaction[] }>
  reactionEvents: ChatReaction[]
}
```

- Die Anzeige verwendet `messages[].reactions` direkt an der Ursprungsnachricht. Ein leeres Array bedeutet, dass aktuell keine Reaktion für diese Nachricht vorliegt.
- `reactionEvents` enthält den letzten bekannten Zustand je Ursprungsnachricht und Absender. Darin stehen auch entfernte Reaktionen und Reaktionen auf Nachrichten außerhalb der aktuellen Verlaufsseite. Beim Nachladen lässt sich die Ursprungsnachricht über `targetMessageId` finden. `operation: 'remove'` erzeugt keine Anzeige.
- Reaktionen erhalten keinen eigenen Eintrag in den Nachrichten oder Klärfällen. Ein technischer Lesefehler liefert HTTP 503 mit `code: 'chat_reactions_read_failed'`. Alte Ereignisse ohne gespeicherte Referenz können nicht an einer Nachricht angezeigt werden.
- Kurze Bestätigungen nach einer Antwort sind im Verlauf sichtbar. Der neue Zustand ist `state: 'recorded'` mit `rule: 'social:acknowledged'`. Der Chat gilt als erledigt. Ein erstes Emoji oder ein erster Sticker kann einmalig eine Begrüßung mit `rule: 'begruessung-ohne-anliegen'` auslösen.
- Leere Ereignisse vom Typ `unsupported` ohne erkennbaren Inhalt bekommen weder eine Antwort noch einen Klärfall. Foto, Sprachnachricht und Dokument behalten ihre Hinweise.

## Regressionen vom 23.11.2026

| Uhrzeit (Berlin) | Gespeicherter Eingang | Erwartung |
|---|---|---|
| 10:46:14 | `unsupported` ohne Text und ohne Medienreferenz | Keine Antwort und kein Klärfall |
| 10:56:39 | „Danke“ nach einer Antwort | Keine Antwort, Chat erledigt |
| 10:57:08 | `reaction` ohne alte Nachrichtenreferenz | Keine Antwort und kein Klärfall |
| 10:58:14 | `reaction` ohne alte Nachrichtenreferenz | Keine Antwort und kein Klärfall |

Für neue Reaktionen decken die Tests Zuordnung, Änderung, Entfernung und Wiederholung desselben Ereignisses ab.
