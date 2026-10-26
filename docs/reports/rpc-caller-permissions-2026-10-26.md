# Explizite Rechte je RPC-Aufrufer

## Umsetzung

`npm run test:rpc` und `check:schema` gleichen alle RPC-Aufrufe in `src` und `scripts` mit dem produktiven Funktionskatalog ab. Das ist eine lesende Integrationsprüfung: Sie ruft keine Abrechnungs-, Merge-, Check-in- oder Workerfunktion auf. Ohne Datenbankzugang, Metadatenfunktion oder eindeutigen Vertrag schlägt sie fehl, statt still zu überspringen.

Migration 064 ergänzt ausschließlich die kataloglesende, nur für service_role zugängliche Funktion `rpc_permissions_audit`. Jede Anforderung enthält exakte Funktionssignatur, tatsächliche Datenbankrolle und Herkunftsdatei. PUBLIC, Rollenmitgliedschaft oder bloß implizite Ausführbarkeit ersetzen keinen direkten EXECUTE-Grant. Zusätzlich wird die wirksame Ausführbarkeit samt Schema-USAGE geprüft. Eine fehlende Funktion, Rollenänderung oder andere Signatur lässt die Prüfung fehlschlagen.

## Rollenbeleg und Änderungen

`scripts/rpc-contracts.json` hält 42 Aufrufstellen in 20 Quelldateien sowie die Hashes der Client-Fabrik und 16 weiteren Herkunftsdateien fest. Browseraufrufe stammen aus dem angemeldeten Dashboard und verwenden authenticated. Dienst-/API-Aufrufe verwenden den Service-Key-Client; injizierte Clients werden bis zur Client-Fabrik bzw. ihren produktiven Aufrufern geprüft. Die Hashes sind bewusst streng: Auch eine Änderung an einer bestehenden Aufrufstelle erzwingt erneute Prüfung, statt Rollen aufgrund eines Dateinamens zu erraten. Neue Nutzer der bekannten injizierten Datenbankgrenzen benötigen ebenfalls einen Herkunftsbeleg.

Ein endlicher dynamischer Funktionsname (die zwei Merge-Varianten) wird vollständig inventarisiert. Beliebige dynamische Namen und aus einem Client herausgelöste RPC-Methoden sind nicht zulässig. Neue RPCs benötigen Rollen-/Signaturvertrag **und** einen ausdrücklichen produktiven Grant per Migration. Verträge dürfen nie automatisch aus Fehlern freigegeben oder fehlende Grants pauschal erteilt werden.

## Gefundener Altfehler

`generateQuartalSummary` rief die nicht vorhandene Funktion `get_quartal_stats` auf und ignorierte deren Fehler. Dieser Phantomaufruf wurde entfernt. Die bereits gelesene Ratenübersicht bleibt unverändert Eingang der Zusammenfassung; neue Statistiken oder Datenbankfunktionen wurden nicht erfunden.

## Prüfung

- Live: alle 42 inventarisierten Aufrufstellen besitzen ihre direkten erforderlichen Rechte; keine Freigabe musste erweitert werden.
- Vollständiger Produktions-Schemacheck einschließlich neuem RPC-Vertrag grün.
- Isolierte PostgreSQL-Tests: PUBLIC allein genügt nicht, Mitgliedschaft allein genügt nicht, direkter Grant funktioniert, Entzug wird erkannt, unbekannte Rolle/Signatur scheitert, anonymer Zugriff auf den Prüfer gesperrt.
- Scanner-Tests: endliche dynamische Ziele erfasst, unbekannte/extrahierte Ziele abgewiesen, geänderte Rollenbelege erkannt.

Die 48-Stunden-Beobachtung läuft unverändert. Der Modulbau erfolgt parallel im eigenen Repo; `abrechnung_runtime` wird vor dem Abschlussbericht nicht produktiv angelegt. Die bekannte offene Standardrechtefrage der verwalteten Rolle supabase_admin ist vom Nutzer ausdrücklich akzeptiert und bleibt im Zehn-Minuten-Check sichtbar.
