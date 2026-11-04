# AnimaSign-Fehleranalyse vom 04.11.2026

## Datenbasis und Grenze der Zeitreihe

Ausgewertet wurde `anamnese_submissions` in Production. Die Tabelle besitzt
keinen eigenen Zeitpunkt, zu dem `status = 'fehler'` gesetzt wurde. Der Verlauf
gruppiert deshalb die heute roten Einreichungen nach `created_at`, also nach dem
Eingangstag. `updated_at` ist dafür nicht belastbar, weil auch andere Prozesse
diesen Wert verändern.

## Rote Einreichungen

| Ursache | Anzahl |
| --- | ---: |
| Signaturdienst | 57 |
| Als Dublette geschlossen | 2 |
| Vom Patienten abgelehnt oder abgebrochen | 0 |
| PDF-Dienst | 0 |
| Fehlende Konfiguration | 0 |
| **Gesamt** | **59** |

### Verlauf seit 20.10.2026

| Eingangstag | Signaturdienst | Dublette | Abgelehnt | PDF | Konfiguration |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20.10. | 3 | 0 | 0 | 0 | 0 |
| 21.10. | 17 | 0 | 0 | 0 | 0 |
| 22.10. | 4 | 0 | 0 | 0 | 0 |
| 23.10. | 1 | 0 | 0 | 0 | 0 |
| 24.10. | 1 | 0 | 0 | 0 | 0 |
| 26.10. | 1 | 0 | 0 | 0 | 0 |
| 27.10. | 3 | 0 | 0 | 0 | 0 |
| 28.10. | 6 | 0 | 0 | 0 | 0 |
| 29.10. | 4 | 0 | 0 | 0 | 0 |
| 02.11. | 2 | 0 | 0 | 0 | 0 |
| 03.11. | 5 | 0 | 0 | 0 | 0 |
| **Gesamt** | **47** | **0** | **0** | **0** | **0** |

Tage ohne rote Eingänge sind ausgelassen.

## Signaturdienstfehler und API-v2-Vertrag

| HTTP-Status | Anzahl | Historischer Antworttext |
| --- | ---: | --- |
| 400 | 9 | Nicht gespeichert |
| 502 | 48 | Nicht gespeichert |

`fehler_text` enthält historisch nur Endpoint und HTTP-Status. Der Body aus
`DocumensoError.body` wurde beim Speichern durch `String(error)` verworfen.
Deshalb lässt sich der genaue historische Antworttext nicht seriös
rekonstruieren. Am 04.11. antwortete die komplette konfigurierte
Signaturdienst-Instanz einschließlich Health- und OpenAPI-Endpunkt mit HTTP 502
und leerem Body.

Alle 57 betroffenen Einreichungen besaßen eine E-Mail-Adresse. Der Fallback
`email ?? ""` war bei diesen Fehlern daher nicht die Ursache.

Abgleich mit der offiziellen API-v2-Dokumentation:

- `POST /envelope/create` als `multipart/form-data` mit `payload` und `files`
  entspricht dem Vertrag.
- `type`, `title`, Empfänger mit `email`, `name`, `role` und `fields` entsprechen
  dem Vertrag.
- `page` ist 1-basiert; `positionX`, `positionY`, `width` und `height` sind
  Prozentwerte. Die Implementierung entspricht dem Vertrag.
- Der offizielle Leitfaden zeigt für jedes Feld `identifier: 0`. In der
  aktuellen offiziellen OpenAPI-Spezifikation ist `identifier` jedoch optional;
  bei einer einzelnen Datei ist das Weglassen daher kein nachgewiesener
  Vertragsbruch.
- `POST /envelope/distribute` mit `envelopeId` und
  `meta.distributionMethod = "NONE"` entspricht der aktuellen OpenAPI-Spezifikation.
- Der Empfänger ist als Objekt Pflicht. Die aktuelle OpenAPI-Spezifikation lässt
  beim Feld `email` zwar auch die leere Zeichenfolge zu, der offizielle Leitfaden
  beschreibt eine fehlende Empfänger-E-Mail aber als Fehlerfall. Vor dem Versand
  sollte sie deshalb fachlich validiert werden; diese Änderung war nicht Teil
  der Freigabe.

Quellen:

- https://docs.documenso.com/docs/developers/getting-started/first-api-call
- https://docs.documenso.com/docs/developers/api/documents
- https://app.documenso.com/api/v2/openapi.json

## Ausstehende Signaturen

Die im Dashboard ausgewiesenen 73 offenen Signaturen setzen sich zusammen aus:

| Datenbankstatus | Anzahl | Envelope vorhanden |
| --- | ---: | ---: |
| `signatur_ausstehend` | 68 | 68 |
| `offen` | 5 | 0 |

Der aktuelle Zustand der 68 Envelopes konnte nicht gelesen werden, weil die
Signaturdienst-Instanz jeden Lesezugriff mit HTTP 502 und leerem Body abweist.
Es wurde kein Status geraten und kein Datensatz verändert.

## Später erfolgreiche Einreichungen

11 heute rote Einreichungen haben eine zeitlich spätere, erfolgreiche
Einreichung derselben Identität. Das betrifft drei Personen:

- 9 Signaturdienstfehler gehören zu einer Person mit späterem Erfolg.
- Die 2 geschlossenen Dubletten gehören jeweils zu einer Person mit späterem
  Erfolg.

## X.509 vor Documenso

Die offizielle Documenso-Dokumentation beschreibt, dass Felder in das PDF
eingebracht und das abgeschlossene Dokument anschließend mit Documensos
Zertifikat versiegelt wird. Sie garantiert nicht, dass eine bereits im Upload
enthaltene ByteRange-Signatur nach dieser Bearbeitung unverändert gültig bleibt.
Die fachlich maßgebliche Garantie der Dokumentation ist Documensos finale
Versiegelung. Eine vorgeschaltete X.509-Signatur muss deshalb am finalen,
heruntergeladenen PDF separat validiert werden, bevor ihre Fortgeltung behauptet
werden kann.

Quelle:

- https://docs.documenso.com/docs/concepts/signing-workflow

## Identitätskonflikte

Für „möglicher Zweitname“ oder „zwei IVORIS-Akten“ existiert keine vollständige,
rollenbeschränkte Backend-Aktion in der Anwendung. Vorhanden sind:

- Konflikterkennung in der Review-Queue,
- eine manuelle Zuordnung einer Einreichung zu einem Patienten,
- auditierte, niedrigstufige Merge-RPCs und Wartungsskripte.

Vorschlag, nicht umgesetzt: Eine Admin-Aktion „Identität bestätigen und
kanonische Akte wählen“. Sie zeigt beide Akten, Geburtsdatum und die für den
Merge erforderliche Kontaktübereinstimmung, verlangt einen Grund und ruft erst
nach ausdrücklicher Bestätigung den auditierten Merge mit IVORIS-Alias auf.

## Nicht umgesetzter Vorschlag für Dublettenstatus

| Heute | Vorschlag nach gesonderter Freigabe |
| --- | --- |
| `status = 'fehler'`, Ursache nur in `fehler_text` | Neuer CHECK-Wert `dubletten_geschlossen` |
| Dubletten erscheinen als technische Fehler | Eigene fachliche Kategorie, nicht rot |
| `fehler_text` enthält die Referenz-ID | Separater, interner Schließgrund; Dashboard liefert nur einen festen, datensparsamen Satz |

Erforderlich wären eine Migration des CHECK-Constraints, eine einmalige
Umklassifizierung der zwei Bestandszeilen sowie die Umstellung beider
Dubletten-Schreiber. Nichts davon wurde ohne Juans Freigabe ausgeführt.

## Umgesetzte freigegebene Punkte

1. `@signpdf/placeholder-plain` wurde durch
   `@signpdf/placeholder-pdf-lib` und `pdflibAddPlaceholder` ersetzt. Der
   `useObjectStreams: false`-Workaround wurde entfernt.
2. Ein Regressionstest erzeugt ein temporäres Testzertifikat, signiert ein von
   `pdf-lib` erzeugtes PDF und validiert die detached CMS-Signatur mit OpenSSL.
3. Die Dashboard-API liefert `error_kind` und einen festen,
   praxistauglichen `error_reason`. Der rohe `fehler_text` wird nicht an den
   Browser weitergegeben.
