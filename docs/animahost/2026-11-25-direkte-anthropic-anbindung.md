# AnimaHost direkt über Anthropic (25.11.2026)

## Entscheidung
Juan hat am 25.11.2026 entschieden, AnimaHost vom Vercel AI Gateway auf die direkte Anthropic-API umzustellen, damit AnimaHost nicht an einem leeren Vercel-Guthaben hängt. Die direkte API bietet keine EU-only-Verarbeitung (`inference_geo` nur `global` oder `us`, Workspace-Speicherort nur `us`) und keine Nullspeicherung ohne eigene Vereinbarung mit Anthropic. Juan hat das ausdrücklich in Kauf genommen („Testphase“). Die frühere Vorgabe `gatewayOptions` (EU, Zero Data Retention) wird nicht mehr verwendet.

## Schlüssel
- Live (Patientenantworten, Einordnung, Formulierung, Praxisstimme, Wissensfreigabe): nur `ANIMAHOST_ANTHROPIC_LIVE_KEY`.
- Test (Probelauf in AnimaDesk, Qualitätsläufe, Benchmarks, Proben, Tagesauswertung, Skripte): nur `ANIMAHOST_ANTHROPIC_TEST_KEY`.
- Kein gegenseitiger Ersatz, kein Rückgriff auf `ANTHROPIC_API_KEY`. Fehlt ein Schlüssel, scheitert der Aufruf mit `model_key_missing:live|test`.
- Umsetzung: `src/lib/services/animahost-model-access.ts` (offizieller AI-SDK-Anbieter `@ai-sdk/anthropic`, `createAnthropic({apiKey})`). `modelGenerate(..., {purpose})` in `animahost-chain-model.ts`; Skripte nutzen `testModelGenerate` bzw. den alten Namen `gatewayGenerate`, beide immer Test.

## Kosten
Kosten je Aufruf aus den Token-Zahlen nach Listenpreis Haiku 5.5 (global): 0,10 USD Eingabe, 0,50 USD Ausgabe, 0,01 USD Cache-Lesen, 0,125 USD Cache-Schreiben je 1 Mio. Token; über 100.000 Token Prompt das 5-Fache. Unbekannte Modelle: keine Kosten statt geschätzter.
Leeres Anthropic-Guthaben meldet die API als HTTP 400 „credit balance is too low“; das gilt jetzt als `model_budget_exhausted`.
Statische Systemanweisungen werden jetzt auch im Probelauf gecacht.

## Testbudget
Am 25.11.2026 um 18:46 von Juan verworfen: keine Tagesgrenze, Testläufe laufen frei über den Test-Schlüssel.

## Offen
- Warnung bei weniger als 3 USD Live-Guthaben: Die direkte API hat keinen Guthaben-Abruf. Das Vercel-Guthaben gehört nicht mehr zu AnimaHost und wird deshalb nicht mehr angezeigt.
- Wiederverwendung unveränderter Replay-Fälle und Zweitbewertung nur bei Unsicherheit: betrifft die Replay-Skripte, noch nicht umgesetzt.
