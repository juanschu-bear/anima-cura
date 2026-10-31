<!-- generated-by: gsd-doc-writer -->
# Scribe-Konsistenzprüfung: API-Vertrag und Claude-Handoff

Stand: 31.10.2026. Deterministische serverseitige Konsistenzprüfung vor Bestätigung, neuer Version und Positionsexport. Keine KI-Vollprüfung und keine klinische, tarifliche oder quartalsbezogene Berechtigungsentscheidung. `no_detected_conflict` bedeutet ausschließlich: Innerhalb der angegebenen Prüfabdeckung wurde kein Konflikt erkannt. `billingApproved` bleibt immer `false`.

## Schnittstellen und Datenfluss

| Route | Prüfzeitpunkt und Ergebnis |
| --- | --- |
| `POST /api/doku/eintrag` | `bestaetigen` ist standardmäßig wahr; Prüfung vor Insert oder Entwurfsbeförderung. `bestaetigen: false` erlaubt unvollständige Entwürfe ohne Konsistenzprüfung; bestehende Berechtigungs- und Zimmerprüfungen gelten weiter. |
| `POST /api/doku/eintrag/[id]/version` | Prüft den tatsächlich zusammengeführten Inhalt aus Alteintrag und Änderung, einschließlich übernommener Positionen/Auswahl. Blockiert vor Update und Historienzeile. |
| `GET /api/doku/eintrag/[id]/billing-export` | Prüft auch bereits bestätigte Alteinträge erneut gegen die aktuell lesbaren Vorlagen. Bei Blockade werden keine Positionen und kein `copy_text` ausgegeben. Der Lesezugriff repariert keine Bestandsdaten. |

Alle drei Routen verlangen Anmeldung und `scribe_schreiben` (ohne explizite Einstellung gilt der vorhandene Rollenfallback für `admin`/`verwaltung`). Der Dienst verwendet denselben sitzungsgebundenen Supabase-Client; keine Erweiterung über einen Servicekey. Keine zusätzliche Prüfroute.

```ts
assessScribeConsistency(raw: unknown, rawTemplates: unknown[]): ScribeConsistencyResult
checkScribeConsistency(db: Pick<SupabaseClient, 'from'>, raw: unknown): Promise<ScribeConsistencyResult>
scribeConsistencyFailure(check: ScribeConsistencyResult, url: string): NextResponse
```

Der Dienst liest aktive `doku_vorlagen` nach `behandlungsart` und den mit `+` verbundenen `termin_typ`-Modulen. Aktive Praxisoptionen aus `doku_vorlagen_optionen` werden nach `sort_index`, dann `created_at` angehängt; vorhandene Optionsindizes bleiben erhalten. Praxisfilter: `SCRIBE_PRAXIS_ID`, sonst `praxis-schubert`. Quellenzugriff ausschließlich lesend.

## Eingabevertrag und Grenzen

Die Prüfung erwartet `vorlage_id`, `behandlungsart`, `termin_typ`, `text`, `positionen` sowie optional `auswahl`, `variablen`, `zaehne`. Zusätzliche Felder wie `canConfirm`, `bypass` oder ein Client-Prüfstatus schaffen keinen Override.

| Feld / Grenze | Validierung |
| --- | --- |
| `vorlage_id`, `behandlungsart` | Getrimmte, nicht leere Zeichenfolge, maximal 400 Zeichen. |
| `termin_typ` | 1–2000 Zeichen; maximal 32 nicht leere, eindeutige Module, getrennt durch `+`. |
| `text` | Getrimmt 1–50.000 Zeichen. |
| `auswahl` | `Record<string, Record<string, number[]>>`; pro Gruppe maximal 200 ganzzahlige, nicht negative Indizes. Fehlend/null wird `{}`. |
| `variablen` | `Record<string, unknown>`; fehlend/null wird `{}`. Unterstützte Textplatzhalter: `{zaehne}`, `{von}` → `schienen_von`, `{bis}` → `schienen_bis`, `{bogen}` → `bogen`. |
| `zaehne` | Maximal 52 Zeichenfolgen passend zu `/^[1-8][1-8]$/`; keine Duplikate. Fehlend/null wird `[]`. Das Muster ist keine vollständige anatomische Validierung. |
| `positionen` | Erforderliches Array, maximal 500 Zeilen; `code` getrimmt 1–400 Zeichen, `text` getrimmt 1–2000 Zeichen, `anzahl` ganzzahlig 1–10.000. Ein leeres Array ist syntaktisch zulässig. |
| Vorlagen/Optionen | Ab 100 gelesenen Vorlagen wird blockiert. Optionen werden in Seiten zu 500 geladen; bei Seitenstart ab 10.000 wird blockiert. |

Pro ausgewähltem Modul muss genau eine passende Vorlage existieren; die erste muss zur `vorlage_id` passen. Gruppenreferenzen und Regelindizes werden geprüft. Für aktive Modulgruppen werden unbekannte Gruppen, ungültige/mehrfache Indizes und Mehrfachauswahl bei `single` blockiert. Zurückgebliebene Auswahl anderer, inaktiver Module fügt keine Positionen hinzu. Das Vorlagenmerkmal `req` erzwingt derzeit keine separate Pflichtgruppenauswahl.

## Rückgabe und HTTP-Verhalten

```ts
type ScribeConsistencyIssue = {
  code: string;
  scope: 'input' | 'template' | 'selection' | 'text' | 'positions' | 'source';
  module?: string; group?: string;
  optionIndex?: number; positionIndex?: number; ruleIndex?: number;
  jaw?: 'OK' | 'UK';
};
type ScribeConsistencyResult = {
  ruleVersion: 'scribe-consistency-v1';
  status: 'blocked' | 'no_detected_conflict';
  canConfirm: boolean;
  billingApproved: false;
  coverage: readonly ['template_references', 'selection_text', 'position_multiset', 'wire_change'];
  issues: ScribeConsistencyIssue[];
};
```

Ohne Issues: `status: 'no_detected_conflict'`, `canConfirm: true`. Bereits ein Issue ergibt `status: 'blocked'`, `canConfirm: false`. Fehlende optionale Issue-Felder sind nicht als `null` garantiert; mehrere Issues können dieselbe Ursache beschreiben.

Die Fehlerantwort hat exakt die Hülle `{ status: 'needs_consistency_review', error: string, consistency: ScribeConsistencyResult }` und `Cache-Control: private, no-store`. HTTP **503**, sobald mindestens ein Issue `scope: 'source'` hat; sonst **422**. `error` verwendet bestehendes i18n: `billing.loadError` bei 503, sonst `billing.issue.invalid_field`. `?lang=en` wählt Englisch, alle anderen Werte Deutsch. Interne Quellfehlermeldungen werden nicht ausgegeben.

Erfolgsantworten behalten ihren bisherigen Vertrag und enthalten kein zusätzliches `consistency`-Feld: Eintrag neu **201**, Entwurf aktualisiert/befördert **200**, neue Version **200**, jeweils `{ eintrag }`; bei fehlgeschlagener Historienzeile **207** mit `{ eintrag, warnung }`. Eine bestandene Prüfung garantiert keinen erfolgreichen Schreibvorgang. Bestehende Fehler für Authentifizierung, Pflichtfelder, Zimmer, Konflikte und Datenbankzugriffe bleiben eigenständig; nicht jedes 422 besitzt die Konsistenzhülle.

Export bleibt nach bestandener Konsistenzprüfung zusätzlich von `prepareScribeBillingExport` abhängig: **409** mit `status: 'needs_position_review'` bei ungeeigneten Positionen. Erfolg **200**: `{ status: 'manual_transfer_required', source_entry_id, source_version, confirmed_at, positions, copy_text, notice }`. Das ist eine manuelle Übernahmehilfe, keine IVORIS-Abrechnungsübertragung oder Abrechnungsfreigabe.

## Issue-Codes für die Oberfläche

| Code | Scope | Bedeutung / Bearbeitung |
| --- | --- | --- |
| `input_invalid` | input | Eingabe entspricht dem Schema nicht. |
| `module_selection_invalid` | selection | Modulliste enthält leere oder doppelte Module oder mehr als 32 Module. |
| `teeth_duplicate` | input | Zahn mehrfach angegeben. |
| `template_invalid` | template | Vorlagendaten entsprechen nicht dem Schema. |
| `template_missing_or_ambiguous` | template | Passende Vorlage fehlt oder ist mehrfach vorhanden. |
| `template_identity_mismatch` | template | Erste Modulvorlage passt nicht zur übergebenen ID. |
| `template_text_reference_invalid` | template | Textstruktur verweist auf unbekannte Gruppe. |
| `template_rule_reference_invalid` | template | Positionsregel verweist auf unbekannte Gruppe/Option. |
| `position_without_text_binding` | template | Ausgewählte Positionsbedingung ist nicht in die Textstruktur eingebunden. |
| `selection_invalid` | selection | Gruppe/Index unbekannt, doppelt oder unzulässige Mehrfachauswahl. |
| `text_variable_unresolved` | text | Textvariable unbekannt oder ohne verwendbaren Wert. |
| `selected_text_missing` | text | Text der ausgewählten Option fehlt. |
| `template_text_mismatch` | text | Zusammengesetzter Vorlagentext fehlt als zusammenhängendes Fragment. |
| `position_quantity_unproven` | positions | Zahnabhängige Menge ohne ausgewählte Zähne. |
| `position_unexpected_or_changed` | positions | Zusätzliche/geänderte Zeile: Code, Beschreibung oder Menge weicht ab. |
| `expected_position_missing` | positions | Erwartete Zeile fehlt, einschließlich erforderlicher Mehrfachvorkommen. |
| `wire_jaw_quantity_unproven` | positions | Erfasste Kieferzahl überschreitet die Menge der Bogenregel. |
| `wire_location_unresolved` | text | Erkannter durchgeführter Bogenwechsel ohne eindeutigen Kiefer. |
| `wire_position_unmapped` | positions | Erkannter Bogenwechsel ohne zugeordnete Bogenposition für diesen Kiefer. |
| `wire_text_conflict` | text | Durchgeführter und negierter Wechsel desselben Kiefers widersprechen sich. Ein zusätzlich geplanter Folgewechsel allein widerspricht dem heutigen Wechsel nicht. |
| `wire_position_without_performed_change` | positions | Bogenposition trotz ausschließlich negierter/geplanter Wechselerwähnungen. |
| `template_read_failed` | source | Vorlagen nicht lesbar oder Leselimit erreicht. |
| `practice_options_read_failed` | source | Praxisoptionen nicht vollständig lesbar oder Leselimit erreicht. |
| `practice_options_invalid` | source | Zugeordnete Praxisoption hat ungültigen Text/ID. |
| `consistency_read_failed` | source | Ausnahme beim Quellenzugriff bzw. dessen Verarbeitung. |

## Fachliche Grenzen und bekannte Vorlage

Textabgleich normalisiert Unicode (NFKC), Groß-/Kleinschreibung und Leerraum. Positionsvergleich erhält Mehrfachvorkommen und vergleicht Code, Beschreibung und Menge; keine Zusammenfassung doppelter Zeilen. Bogenprüfung verwendet ein begrenztes deutsches Satzmuster für „Bogenwechsel“/„Bogen gewechselt/wechseln“, OK/UK und Negations-/Planungswörter. Erkannte Codes: BEMA 127a/b, 128a/b/c, 129 sowie GOZ 6140/6150. Das ist keine umfassende Freitextinterpretation und kein Nachweis einer zulässigen Gebührenziffer.

Die bekannte fehlerhafte Vorlage mit Regelgruppe `bogen` gegenüber Textgruppen `bogen_ok`/`bogen_uk` bleibt absichtlich blockiert, bis eine fachlich korrekte Vorlage vorliegt. Keine automatische Zuordnung von 127/128. Die synthetische BEMA-128a-Zuordnung in Tests ist ausschließlich eine Testfixture.

Die Änderung bearbeitet keine Bestände, Vorlagen, Datenbankschemata oder Mahnungen. Der bestehende Text-IVORIS-Push wurde nicht geändert. Kein neuer DB-Trigger erzwingt diese Prüfung: Die Schutzwirkung liegt an den drei genannten API-Einstiegspunkten. Keine `.tsx`-/`.css`-Dateien wurden für diese Konsistenzänderung angefasst.

## Claude-Handoff und Prüfstand

Claude soll `consistency.issues` in verständliche, spezifische Meldungen je Code übersetzen und anhand von `scope` und Kontextfeldern Vorlagenfehler, Eingabefehler und nicht verfügbare Prüfdaten unterscheiden. Derzeit erscheint nur die bestehende generische i18n-Fehlermeldung. Eingaben erhalten, betroffene Gruppe/Position kenntlich machen und Entwurf anbieten; bei Versionskorrekturen keinen nicht vorhandenen Entwurfsmodus dieser Route erfinden. Keine Umgehung, keine Freigabe-Schaltfläche für blockierte Inhalte und keine automatische Vorlagen-/Gebührenkorrektur implementieren. Vorlagenfehler benötigen fachliche Korrektur, Quellenfehler einen erneuten Prüfversuch.

28 eigenständige Konsistenz-/API-Tests prüfen die Regel einschließlich des API-Schreibstopps. `npm test`, `npm run typecheck` und `npm run build` sind vor dem Commit erfolgreich durchgelaufen. Ein Live-Test mit Praxisanmeldung ist damit nicht ersetzt; dieses Dokument bestätigt kein Deployment. Die ausschließlich lesende Prüfung der aktuellen Vorlagen ergab 68 schemakonforme Vorlagen und genau eine ungültige Positionsreferenz (`multiband:kontrolle`, Gruppe `bogen`).

Quellen: `src/lib/scribe-consistency.ts`, `src/lib/scribe-consistency-service.ts`, die drei oben genannten Routen unter `src/app/api/doku/eintrag/`, `src/lib/services/__tests__/scribe-consistency.test.ts` und `scribe-consistency-api.test.ts`.
