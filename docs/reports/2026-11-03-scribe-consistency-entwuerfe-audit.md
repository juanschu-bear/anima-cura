# Scribe-Konsistenzprüfung: Entwurfs-Audit

Stand: 03.11.2026. Ausschließlich aggregierte, lesende Auswertung ohne Namen, Patientenkennungen oder Dokumentationstexte.

## Angeforderte Grundgesamtheit

Abfrage: `doku_eintraege.status = 'entwurf'` und `created_at >= 2026-10-31T00:00:00+01:00`.

| Ergebnis | Anzahl |
| --- | ---: |
| Entwürfe seit 31.10. | 0 |
| davon durch `assessScribeConsistency` blockiert | 0 |
| Issue-Codes | keine |

Auch insgesamt existiert derzeit kein gespeicherter Entwurf. Ein abgelehnter Bestätigungsversuch wird vor dem Insert/Update gestoppt und erzeugt deshalb keinen nachträglich auswertbaren Entwurf. Die Produktionsdaten enthalten somit keine historische Verteilung der abgelehnten Versuche.

## Ergänzende Bestandsmessung

Zur Einordnung wurden alle 735 vorhandenen bestätigten Einträge lesend gegen die aktuell aktiven Vorlagen und Praxisoptionen geprüft. Das ist eine Bestandskompatibilitätsmessung und keine Rekonstruktion der seit 31.10. abgelehnten Requests.

| Ergebnis | Anzahl |
| --- | ---: |
| ohne erkannten Konflikt | 282 |
| mit mindestens einem Konflikt | 453 |

| Issue-Code | Vorkommen |
| --- | ---: |
| `template_rule_reference_invalid` | 399 |
| `wire_position_unmapped` | 275 |
| `template_text_mismatch` | 228 |
| `selection_invalid` | 211 |
| `selected_text_missing` | 179 |
| `position_unexpected_or_changed` | 22 |
| `wire_text_conflict` | 7 |
| `wire_location_unresolved` | 5 |
| `position_quantity_unproven` | 3 |
| `expected_position_missing` | 3 |
| `wire_jaw_quantity_unproven` | 0 |
| `text_variable_unresolved` | 0 nach Angleichung der optionalen Felder |

Die dominante Ursache ist weiterhin die bekannte aktive Vorlage `multiband|kontrolle`: Ihre Positionsregel verweist auf die alte Gruppe `bogen`, während das Cockpit `bogen_ok` und `bogen_uk` verwendet. Diese Konfiguration wird nicht automatisch in eine Gebührenposition umgedeutet.

## Vier Cockpit-Widersprüche in echten Bestandsdaten

| Fall | Vorkommen | Verhalten nach Angleichung |
| --- | ---: | --- |
| optionale `{von}`/`{bis}` ohne Wert | 2 | rendert wie das Cockpit `?`; blockiert nicht |
| `count:'zaehne'` ohne ausgewählten Zahn | 3 | blockiert eindeutig mit `position_quantity_unproven`, ohne Folgefehler zur Mengenabweichung |
| `{bogen}` ohne Wert | 0 | blockiert eindeutig mit `text_variable_unresolved` und einer Bogen-spezifischen Meldung |
| OK und UK bei nur einer Bogenposition | 0 | blockiert eindeutig mit `wire_jaw_quantity_unproven`, ohne zusätzliche Meldung einer fehlenden Zuordnung |

Jede 422-Antwort liefert je Issue weiterhin die maschinenlesbaren Felder und zusätzlich `message` als verständlichen Praxissatz. Die Prüfung erteilt keine Abrechnungsfreigabe und verändert keine Bestandsdaten.
