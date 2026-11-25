# Teamantworten und Gatewayfehler – 25.11.2026

## Befund und Korrektur

Antworten vom Praxishandy wurden nur in `animaline_outbound_messages` und als Chatpause gespeichert. Der Status früherer Eingänge blieb unverändert. Beim AnimaDesk-Versand wurde nur die ausdrücklich referenzierte Nachricht geschlossen. Die neue Datenbankverarbeitung schließt für beide menschlichen Quellen alle vorherigen noch offenen Eingänge desselben Chats und Mandanten. Spätere Eingänge bleiben neue Fälle. Modellantworten schließen keine menschlichen Klärfälle.

Nachtrag bei Installation: 31 fälschlich in `needs_review` stehende Eingänge in 15 Chats gefunden. Insgesamt 46 noch nicht abgeschlossene Eingänge in 17 Chats korrigiert (einschließlich aufgezeichneter/zusammengefasster Eingänge). Der gemeldete Eingang vom 25.11., 12:42:32 MEZ ist jetzt `sent / answered_by_team`. Originalentscheidung und Prüferbelege bleiben erhalten; `decision.teamAnswer` enthält Anbieterkennung, Antwortzeit und Quelle. Geplante Antworten werden `superseded`; ein verspätetes Modellergebnis darf den erledigten Fall nicht wieder öffnen. Die API liefert für `answered_by_team` den Bereich `done`, auch wenn noch eine Chatpause besteht.

Migration `20261125150000_team_answers.sql`, AnimaLine `yucpobkmfvjsuuwtffvr`, SHA-256 `0f9d2ff1c28561869ecf6ae02bbe37a248949bc2a303197b8dc0b17c2f5ced7b`. Eingespielt. Keine Nachrichten nachträglich gesendet.

## Gateway

Guthabenabfrage am 25.11.2026 um 12:59:33 MEZ: **−0,001603869 USD**, `totalUsed=40.000375 USD`. Guthaben aufgebraucht. Eine anschließende synthetische Anfrage ohne Patientendaten bestätigt HTTP **402**, Typ `insufficient_funds`, SDK-Name **GatewayInternalServerError**. Das Gateway verlangt ein positives Guthaben auch für BYOK, damit Ersatzanbieter verfügbar bleiben.

Der ursprüngliche Beleg von 12:42 enthält zweimal nur `technical_failure:GatewayInternalServerError`, keinen HTTP-Status und keinen Guthabenstand. Die aktuelle Ursache ist damit als Budgetmangel belegt; eine rückwirkende Unterscheidung von Gateway- und Anbieterproblemen allein aus diesem alten Beleg ist nicht möglich. Es gibt keinen Beleg für einen allgemeinen Vercel-Ausfall.

Technische HTTP-429-/5xx- und Verbindungsfehler werden genau einmal nach 750 ms wiederholt, innerhalb des vorhandenen Zeitbudgets. HTTP 429 ist eine Begrenzung der Anfragerate, kein Nachweis leeren Guthabens. HTTP 402 wird sofort `model_budget_exhausted`. Bei unklarem Anbieterfehler wird zusätzlich der Guthabenstand gelesen; fehlt Guthaben, wird ebenfalls dieser eindeutige Code gesetzt. Schlägt auch der zweite technische Versuch fehl, verhindert eine Sperre weitere Modellaufrufe aus der inhaltlichen Korrekturschleife.

AnimaDesk verwendet den bestehenden Vertrag `details.modelFailure={code,stage,httpStatus?}`; die vorhandene Budgetanzeige greift damit auch bei Fehlern im neuen Antwortkern. `technicalRetries` wird in der technischen Modellspur erfasst. Systemtext und Prüfanweisung bleiben unverändert.

Ohne Aufladung kann AnimaHost weiterhin keine Modellantwort erzeugen. Es wurde keine kostenpflichtige Aufladung ausgelöst.

## Prüfung

AnimaLine-Release: 79 Tests und Build bestanden. Anima Cura: vollständiges `npm test` und Build bestanden, einschließlich 218 AnimaHost-Tests. Die Gesamtsuite fand zuvor drei veraltete RPC-Prüfsummen. Cookie-gebundene Benachrichtigungs-RPCs sowie die Service-Clients hinter authentifiziertem WhatsApp-Eingang und Retrieval wurden geprüft; Rechte und RPC-Signaturen sind unverändert, die Bestandsnachweise wurden aktualisiert. Keine Änderung am Systemtext oder an der Prüfanweisung; der bestehende Replay-Nachweis bleibt gültig.
