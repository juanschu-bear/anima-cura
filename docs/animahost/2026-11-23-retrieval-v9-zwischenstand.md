# AnimaHost · Abnahme mit Regelbuch 9 unterbrochen

Historischer Zwischenstand. Der [vollständige Folgelauf](2026-11-23-retrieval-239-abnahme.md) liegt vor.

Der alte API-Stand ist als nicht abnahmefähig gekennzeichnet. Die neue Abnahme nutzt Antwortlogik `cc615c4`, Regelbuch 9 und beide Wissensstände. Es wurde nichts gesendet.

| Ergebnis | Entwurfswissen | Freigegebenes Wissen |
| --- | ---: | ---: |
| Vorgesehene Fälle | 239 | 239 |
| Ausgeführt bis zum Budgetstopp | 25 | 24 |
| Antworttext erzeugt und vom Antwortkern freigegeben | 17 | 16 |
| Bewusst ohne Antwort (Team, Nichtpatient, unlesbarer Eingang) | 5 | 5 |
| Technischer Fehler, HTTP 402 | 3 | 3 |
| Noch offen | 214 | 215 |
| Median der Erzeugungszeit bei erzeugten Antworten | 7,40 s | 8,17 s |

HTTP 402 in der Prüfung bei `draft_preview/L22`, `draft_preview/L23`, `draft_preview/L25` und `approved/L22`. HTTP 402 beim Formulieren bei `approved/L23` und `approved/L24`.

Der Testschlüssel hat ein einmaliges Limit von 20 USD. Vercel hat beide Läufe gestoppt, weil das gemeinsame Guthaben des Teams `juanschu-bears-projects` bei −0,01 USD lag. Automatisches Aufladen ist aus. Für Production war kein eigenes oder geerbtes AI-Gateway-Budget aktiv.

Die 33 Texte bleiben bis zur zweiten Anonymisierungsprüfung außerhalb des Repositories. Die Prüfung aller Antworten gegen die sechs Goldbeispiele und die Wissensbasis sowie die Rangliste sind offen. Der Läufer setzt bei den sechs technischen Fehlern und den noch unberechneten Fällen fort. Die Fehlerhistorie bleibt je Fall erhalten.

## Sprachmuster in den 33 vorliegenden Antworten

Die Textsuche erfasst auch sachlich berechtigte Übergaben und Identitätsfragen. Die Prüfung im Zusammenhang steht noch aus.

| Suchmuster | Entwurfswissen | Freigegebenes Wissen |
| --- | --- | --- |
| Übergabeformel | L01, L03, L05, L08, L09, L10, L14, L16, L17, L21 | L03, L05, L06, L08, L09, L10, L14, L16, L17, L21 |
| Standardfrage zur Zuordnung | L01, L02, L03, L04, L05, L06, L07, L08, L09, L13, L16, L17, L21 | L01, L02, L03, L04, L05, L06, L07, L08, L09, L12, L16, L17 |
| „kann ich hier nicht einsehen“ oder ähnlich | L05 | L05, L21 |
| Rückmeldeformel | L04, L08, L09, L10, L12, L13, L14, L16, L17, L21, L24 | L02, L04, L05, L06, L08, L09, L10, L13, L14, L16, L17, L21 |

Der Antwortkern ergänzt bei fehlender Uhrzeit oder Tagesangabe einen festen Rückmeldesatz und bei fehlender Zuordnung eine feste Namensfrage. Für den nächsten Korrekturlauf gehören Zeitpunkt und Zuständigkeit in den Satz über die konkrete Aufgabe. Die Namensfrage braucht einen Bezug zum Anliegen und entfällt bei bereits belegter Zuordnung. Bei Zugriffsbeschränkungen muss die Antwort den tatsächlich verfügbaren Weg oder nächsten Schritt nennen. Die Praxiszeit und die Anforderungen an eine bestätigte Identität gelten weiter.
