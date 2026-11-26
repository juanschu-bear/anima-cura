# Kennzeichnung und Anrede – 26.11.2026

## Nachgewiesener Ausgangsfehler

Am 25.11. zwischen 18 und 20 Uhr MEZ wurden zwölf automatische Antworten ohne Vorsatz protokolliert. Die verbindliche kurze Kennzeichnung war im laufenden Daemon erst ab 22:48:59 MEZ aktiv. Der vom Nutzer gezeigte Fall liegt davor. Die gespeicherte Patientenzuordnung enthielt ein Geburtsdatum einer minderjährigen Person, aber keine belegte Absenderrolle. Namen, Telefonnummern und Geburtsdatum sind nicht Teil dieses Berichts.

## Versand

Alle drei automatischen Baileys-Textwege (direkte Antwort, geplante Antwort, Nachfassen) verwenden jetzt `sendHostText` als letzte Versandgrenze. Diese setzt immer genau `*AnimaHost:* ` vor den Text; WhatsApp zeigt den Vorsatz fett an. Doppelte/alte Vorsätze werden normalisiert. Leere Texte werden nicht versendet. Bereits gespeicherte Versandtexte enthalten denselben Vorsatz. Manuelle AnimaDesk-Nachrichten und Praxishandy-Antworten werden nicht als AnimaHost ausgegeben.

Auch der alternative Meta-Worker kennzeichnet automatische Texte. Eine nicht überprüfbare Vorlagen-Nachricht wird gesperrt: Ein Vorlagenname allein beweist nicht, dass der sichtbare Text gekennzeichnet ist. Keine Änderung bereits versendeter Nachrichten und kein Testversand an Patienten.

## Anrede

Minderjährigkeit wird anhand des Geburtstags am Eingangstag in Berlin bestimmt. Die Zuordnung einer Nummer zu einem minderjährigen Patienten belegt nicht die Person am Handy. Ohne eigene Namensangabe oder belegte Elternzuordnung wird der Patient als Gesprächsgegenstand geführt; die Anrede bleibt neutral. Eine ausdrückliche eigene Vorstellung des Jugendlichen kann die Anrede begründen. Nur eingehende Angaben zählen, keine früheren Systemantworten. Eine aktuelle Aussage „mein Kind“ hat Vorrang vor einer älteren eigenen Vorstellung.

Das Modell erhält diese Trennung im Patientenblatt. Zusätzlich entfernt eine enge Textprüfung direkte Anreden mit dem Kindernamen, wenn die schreibende Person nicht als dieses Kind belegt ist. Inhaltliche Verweise wie „Termin für Mira“ bleiben erhalten. Bei belegtem Elternnamen bleibt dessen eigener Name erhalten, auch bei abweichendem Nachnamen. Der Nachname des Kindes begründet keine Anrede „Frau/Herr …“. Keine zusätzlichen Aktenrechte, keine Namenszuordnung allein aufgrund dieser Anredeprüfung.

Tests mit erfundenen Daten decken die Volljährigkeitsgrenze, Selbstvorstellung, Eltern mit anderem Nachnamen, falsche Vorgaben aus Systemantworten, neutrale Anschlussantworten und Erhalt inhaltlicher Kindernamen ab. Transporttests prüfen Kennzeichnung, doppelte Vorsätze, leere Texte, Meta-Vorlagen und alle drei Daemon-Versandstellen. Systemtext und Prüfanweisung bleiben unverändert.

## Verifikation

87 AnimaLine-Tests und Build bestanden; Daemon und API veröffentlicht, Daemon verbunden. 654 Cura-Tests einschließlich 225 AnimaHost-Tests bestanden; der Anrede-Test wurde nach der Ergänzung für einen bekannten Elternnamen mit gleichem Nachnamen nochmals ausgeführt. Keine kostenpflichtigen Modellaufrufe und kein WhatsApp-Testversand. Die Beispiele sind deterministische Anredeprüfungen, kein behaupteter vollständiger Modell-Probelauf.
