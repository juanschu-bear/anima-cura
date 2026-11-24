# Erste zehn Live-Antworten des neuen Kerns

Aktiviert: 23.11.26, 22:50:58 (Europe/Berlin). Stand: 24.11.26, 09:46:52.

Erfasst: **3/10 tatsächlich versendete Antworten**. Nur echte Eingänge, keine künstlichen Patientennachrichten. Fehlende Antworten werden nicht durch Probeläufe ersetzt.

Production: ANIMAHOST_RETRIEVAL_PASSED=true und ANIMALINE_RETRIEVAL_POLICY=1. Keine Nachtpause. Vier Goldbeispiele für unklare Eingänge.


## Modellstörungen

Modellbudget erschöpft: **0**. Der Versand einer Ersatzantwort steht beim jeweiligen Eingang.

## Antwort 1

Eingang: 24.11.26, 07:50:19. Versand: 24.11.26, 07:51:09. Tatsächliche Verzögerung: 50.7 Sekunden; geplant: 24.11.26, 07:51:09 (reading_and_writing, Ziel 50 Sekunden).

Eingangstext: Guten Morgen, ich habe bisher über Doctolib noch keine Bestätigung für die Terminänderung bekommen. Geht die Terminverschiebung auf kommenden Montag klar?
Mit freundlichen Grüße [Person]

Antwort: Guten Morgen, eine Bestätigung der Terminänderung sehe ich hier im Chat nicht. Der Empfang prüft, ob die Verschiebung auf Montag eingetragen ist und ob der Montagstermin noch [Person] ist. Bitte buchen Sie bis dahin nicht erneut um, damit nichts doppelt angelegt wird.

Architektur im Beleg: retrieval-v1. Patientenblatt: unconfirmed. Gefüllte Felder: keine.

gold: gold-wann-termin (v1, 2026-11-23T00:00:00+00:00); gold-widerspruch-onlinebuchung (v1, 2026-11-23T00:00:00+00:00); gold-attachment-spontan (v1, 2026-11-23T00:00:00+00:00).

knowledge: keine.

rule: keine.

history: 050b077d959d4c66a0a457a16933358d6a979ebcf6ebfb80e7a42de39859417a (v1, 2026-03-25T09:14:25+00:00); b0f504aff9ce1a93beee90158f077ab59574fcd5daa9e09d9a19696140dacd44 (v1, 2026-10-19T17:43:58+00:00); 55c53cc32073d04de40309b2d53848271236114c9d5411544006f0a718785adc (v1, 2026-06-02T16:24:00+00:00); 6f0fc9a63043d734e4956921998649203a88ac42aed2006d91384516bf2142cc (v1, 2026-08-18T17:46:03+00:00); 4df34b5c6ce3993d9a5b9eb7ba7d8a9f7548b4d10b53c6a748bd026e12cb5424 (v1, 2026-03-16T13:16:44+00:00).


## Antwort 2

Eingang: 24.11.26, 08:12:34. Versand: 24.11.26, 08:13:04. Tatsächliche Verzögerung: 30.6 Sekunden; geplant: 24.11.26, 08:13:04 (reading_and_writing, Ziel 30 Sekunden).

Eingangstext: Guten Morgen

Antwort: Ich helfe Ihnen gern. Worum geht es?

Architektur im Beleg: retrieval-v1. Patientenblatt: unlinked. Gefüllte Felder: keine.

gold: keine.

knowledge: keine.

rule: keine.

history: keine.


## Antwort 3

Eingang: 24.11.26, 09:35:55. Versand: 24.11.26, 09:36:17. Tatsächliche Verzögerung: 22.0 Sekunden; geplant: 24.11.26, 09:36:16 (reading_and_writing, Ziel 20 Sekunden).

Beim Formulieren wurde das Modellzeitlimit erreicht. AnimaHost verschickte nach 22,0 Sekunden die sichere Ersatzantwort. Der Beleg enthält die AnimaLine-Eintrags-ID.

Eingangstext: Hallo,
 ich bräuchte die Abschlussrechnungen von mir und meiner Schwester [Person] . Um bei der Versicherung die Rückerstattung erhalten zu können. Soll ich bei Ihnen Vorort vorbeikommen um diese zu holen oder geht es auch [Person] animacura?

LG [Person]

Antwort: Das Praxisteam prüft Ihre Frage zur Abrechnung. Sie hören heute bis 12 Uhr von uns.

Architektur im Beleg: retrieval-v1. Patientenblatt: ambiguous. Gefüllte Felder: keine.

gold: gold-fremdsprache-unlesbar (v1, 2026-11-23T00:00:00+00:00); gold-teamnachricht (v1, 2026-11-23T00:00:00+00:00); gold-widerspruch-onlinebuchung (v1, 2026-11-23T00:00:00+00:00).

knowledge: keine.

rule: keine.

history: 53b52a63ed88824b2ebb203e059445387780b5cacea439715db2d342af721aa0 (v1, 2026-04-23T09:49:52+00:00); 4d7b3e88c912ad5c140d0a93bb4d164038742a8748b25d4933fc679e47d77653 (v1, 2026-09-11T18:04:31+00:00); 1233aa76c40ca9f494a288531c8ab844d07cd1661cb2992752c35b4fa2bdbe5c (v1, 2026-09-22T07:50:51+00:00); ed4abef31e253c59b8aa2b1ea4a2ec5e37f27d8ea832b1c71f7debcae6839ab6 (v1, 2026-10-05T11:45:34+00:00); 4f8383fbbacb1bb5b9ca5793acacc00970b9ce931852000178726ef569146118 (v1, 2026-10-15T10:05:33+00:00).
