# AnimaHost · Laufzeitvergleich und Import · 23.11.2026

## Ergebnis

Das Laufzeitziel für den **lokalen, versandfreien Modell-Probelauf** ist erreicht: Median **6.94 s** statt **15.00 s**. Über dem Live-Budget von 17 Sekunden liegen **2/110** statt **43/110** Läufe. Die Qualität ist nicht freigegeben: **21 statt 8 zurückgehaltene Antworten**. Der bestehende Schalter `ANIMAHOST_REPLY_CORE_PASSED` wird nicht aktiviert. Die Änderung am Probelauf ist keine Abnahme für automatischen Versand.

| Messgröße | Vorher | Nachher |
|---|---:|---:|
| Gleiche Fälle insgesamt | 139 | 139 |
| Modellläufe | 110 | 110 |
| Median Modellkette | 15.00 s | 6.94 s |
| P90 Modellkette | 27.05 s | 14.38 s |
| Maximum | 41.50 s | 20.27 s |
| Über 17 s | 43 | 2 |
| Feste Schranken und Modellprüfer bestanden | 102 | 89 |
| Inhaltlich zurückgehalten | 2 | 20 |
| Technischer Modellfehler | 6 | 1 |
| Absender ausgeschlossen | 22 | 22 |
| Feste Medienantwort ohne Modell | 7 | 7 |

Die 39 Live-Fälle und 100 Archivfälle stammen aus demselben bereits exportierten Prüfbestand. Kein neuer Patientenkontakt, keine Datenbankänderung, keine Benachrichtigung, kein WhatsApp-Versand. Die Laufzeit umfasst die gesamte Kette einschließlich Wiederholung und Gegenprüfung; Fehler sind nicht aus dem Median herausgerechnet. Das großzügige Beobachtungsbudget von 42 Sekunden blieb für die Vergleichbarkeit gleich. Die 17-Sekunden-Grenze wird separat ausgewertet. Die Messung ist **keine HTTP-Latenz auf Production** und keine zugesicherte Antwortzeit unter Last.

## Ursache und Änderung

- Gleiches Modell: `anthropic/claude-haiku-5.5`. Vorher keine explizite Reasoning-Einstellung. Eine zusätzliche Wiederholung von acht Fällen mit Tokenmessung zeigte pro Entwurf zum Beispiel 1.374 interne Denktokens und pro Gegenprüfung 695, bei nur 443 bzw. 230 Zeichen sichtbarer Ausgabe; zusammen 14,35 Sekunden. Andere Entwürfe nutzten über 3.000 Denktokens.
- Beide Modellschritte wurden nacheinander ausgeführt. Die Eingaben lagen in der Stichprobe bei ungefähr 15.000–16.700 Tokens pro Schritt. Das ist ein zusätzlicher Aufwand; eine getrennte kausale Messung des Promptlängeneffekts liegt nicht vor. Regeln, Wissen und unabhängige Gegenprüfung wurden nicht entfernt.
- Der Benchmark hatte den vollständigen Datenexport bereits im Speicher. Kontextnachladen und Datenbank-Kaltstart erklären **diese** 43 Überschreitungen daher nicht. Ein serverloser Kaltstart ist im lokalen Benchmark nicht enthalten; Netzwerk-/Provider-Wartezeit steckt in der gemessenen Modelldauer und ist nicht separat isoliert.
- Neue Einstellung: `reasoning: none` nur für den Entwurf, `reasoning: low` für den unabhängigen Prüfer. EU-Verarbeitung, Zero Data Retention, Schema-/Quellenprüfung und feste Schranken bleiben erhalten. Vollständiges Abschalten beider Denkphasen wurde verworfen: In der Stichprobe nur zwei von acht bestandene Antworten. `low` bzw. `minimal` für beide Schritte verfehlten das Laufzeitziel.
- Der Probelauf-Endpunkt lädt unabhängige Kontextteile jetzt parallel. Er liefert `timings.contextMs` und `timings.modelMs`; Modellspuren ergänzen Phase, Reasoning-Einstellung und Promptlängen ohne Inhalte. Das macht zukünftige Production-Messungen nach Kontext und Modell trennbar. Der HTTP-/Kaltstartanteil ist damit messbar, aber hier noch nicht neu gemessen.
- Offizielle API-Grundlage: [Vercel Provider Options](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options), [AI SDK Anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic). Die wirksame Reasoning-Einstellung wurde zusätzlich durch die tatsächlich zurückgegebenen Tokenzahlen geprüft.

## Einzelbefunde und Rückschritte

Die [Live-Einzelprüfung](2026-11-23-probelauf-live-faelle.md) enthält für jeden Live-Fall die bereinigte Nachricht, die tatsächlich frühere Antwort, den alten Modell-Probelauf und den neuen Modell-Probelauf getrennt. [Messwerte aller 139 Fälle](2026-11-23-probelauf-messwerte.json) enthalten keine Nachrichten oder Patientenkennungen.

Vorher bestanden, jetzt zurückgehalten: **A04, A06, A28, A39, A41, A43, A44, A47, A50, A54, A70, A76, A78, A94, L27, L30, L32**. Vorher zurückgehalten, jetzt bestanden: **A35, A74, A95, L14**. „Bestanden“ ist kein Beleg, dass eine Antwort inhaltlich gut ist.

Für Claude besonders relevant:

- **L10 – Quellen-/Regelproblem:** Die neue Antwort behauptet die Rechnungsverfügbarkeit, obwohl im Probelauf `invoices:unclear` vorliegt. Die allgemeine Portalregel wird fälschlich zur Aussage über diese konkrete Rechnung. Der Prüfer lässt das passieren. Nicht als bloßes Formulierungsproblem behandeln.
- **L12 – mehrere Anliegen und angesprochene Teamperson:** Terminwunsch und fehlende Rechnung bleiben zurückgehalten; Prüfer nennt `terminzusage` und `unnoetige_uebergabe`. Beide Anliegen und der persönliche Adressat müssen gemeinsam bewertet werden. Keine neue Antwort versendet.
- **L13 – technischer Schemafehler:** Die Modellantwort erfüllt das Ausgabeschema nicht; kein Patiententext freigegeben. Dies ist kein nachgewiesener fachlicher Regelverstoß.
- **L14 – Gesprächs-/Formulierungsproblem trotz bestandenem Prüfer:** Sarkastische Beschwerde erhält erneut Buchungs-/Portalhinweise statt einer angemessenen Reaktion auf den Einwand.
- **L22/L24 – Regel-/Verlaufsproblem:** Einwand, dass noch keine Uhrzeit vereinbart sei bzw. bisher direkt in der Praxis vereinbart wurde. L22 wird wegen Wiederholung zurückgehalten, L24 verweist erneut auf Onlinebuchung. Die frühere Antwort ist nicht automatisch korrekt; sie forderte Identitätsdaten, ohne den Einwand zu lösen.
- **L26 – Umfang und medizinische Grenze:** Die neue Antwort wird deutlich länger und enthält einen Wachshinweis. Der Prüfer akzeptiert ihn; die Praxis muss die Grenze zwischen freigegebenem Selbsthilfehinweis und Behandlungsempfehlung beurteilen. Keine automatische Qualitätsfreigabe daraus ableiten.
- **L27 – Absender-/Regelproblem:** Krankmeldung zur Arbeit wurde im alten eingefrorenen Export als Patientenfall behandelt. Die alte Antwort mit Neubuchungslink war falsch; das neue Zurückhalten ist hier eine Verbesserung gegenüber dieser Antwort, obwohl es statistisch als „bestanden → zurückgehalten“ zählt. Die Transportprüfung blockiert konfigurierte Teamnummern vor der Patientenstrecke. Eine vollständige Teamliste lässt sich aus diesem Export nicht behaupten.
- **L30/L32 – Formulierung und Übergaberegel:** Der Patient hat bereits neu gebucht. Neue Antworten scheitern an `team_ohne_zeit`; die frühere Variante wiederholte teils unnötig Termin-/Portalhinweise. Rückmeldezeit und bereits erfolgte Neubuchung gemeinsam berücksichtigen.

## Wissensimport

Migration 103 unverändert. Die bereits vorhandene Folgemigration 104 ergänzt `gespraech` als eigenen Bereich und getrennte Metadaten. Der Import bildet `quelle:offen` jetzt als `source:praxis` ab und erhält `originalSource:offen`. Alle 51 Einträge bleiben Entwürfe (`active:false`, keine Freigabeperson/-zeit).

Vollständigkeitsprüfung an der echten Importdatei: 51 Einträge, vier im Bereich Gespräch, acht offene Fragen, neun Freigabevermerke, elf referenzierte Quellen. Für **jeden** Eintrag werden `selbsthilfe`, `praxis`, `rezeption`, `warnzeichen`, `offen`, `quellen` und `freigabe` mit dem Importergebnis verglichen. Selbsthilfe/Praxis/Rezeption/Warnzeichen gehen als getrennte `guidance`-Felder in den Modellkontext; offene Fragen und Herkunfts-/Freigabevermerke bleiben redaktionelle Metadaten und werden nicht zu freigegebenem Wissen.

**Datenbankstand geprüft:** `animahost_knowledge_versions` und `animahost_import_knowledge` fehlen auf Production. Migrationen 103 und 104 sind vorbereitet, wurden in diesem Auftrag nicht eingespielt. Daher noch kein Production-Import und keine Wissensfreigabe. Die obige Laufzeitreihe verwendet wie der alte Vergleich den damaligen freigegebenen Wissensstand, nicht den KFO-Entwurf.

## Reproduzieren und Validierung

`node --import tsx scripts/animahost-replay-benchmark.mts PRIVATE_INPUT PRIVATE_OUTPUT approved`

Der Export und die vollständigen Rohspuren bleiben außerhalb von Git. API-Schlüssel nur über die Umgebung. Sechs parallele Fälle, gleiche Regeln und gleiche Daten wie im Vorherlauf. `draft_preview` ist ein gesonderter optionaler Lauf; dessen Ergebnisse dürfen nicht mit dieser kontrollierten Vorher/Nachher-Reihe vermischt werden. Das Skript schreibt nicht in Datenbanken und hat keinen Transportaufruf. Ausgabe innerhalb des Repos wird abgewiesen.

87 AnimaHost-Tests erfolgreich; darunter Import-/Rollen-/Versionsprüfung mit PGlite, unveränderte Schutzschranken und Nachweis, dass auch nach schnellem Entwurf eine erfolgreiche unabhängige Prüfung erforderlich ist. Production-Build erfolgreich. Bereitstellung und Praxisfreigabe sind getrennt: Der neue Antwortkern bleibt ohne Live-Freigabe.

Vorbereitete SQL-Dateien (SHA-256):

- `103_animahost_orthodontic_knowledge.sql`: `1d1e2d9ed844bd485e637a461031fc9b2ca135f9f2b0cce047684b29ae88600f`
- `104_animahost_knowledge_import.sql`: `76ccd6e6d86d42b7cabe51e2c78f7d8ee8f492594657f081cf86b682bd75ba89`

Die Absenderprüfung wurde separat auf AnimaLine aktiviert und ohne Versand auf dem Server geprüft; siehe dort `docs/2026-11-23-sender-policy-rollout.md` (Commit `f1318d0`, auf main über `cff7c60`).
