# AnimaHost: Backend-Vertrag für Claude

Stand 19.11.2026. Diese Schnittstellen betreffen nur die Praxis. Der persönliche WhatsApp-Verlauf wird nicht im Browser über einen Service-Schlüssel geladen.

## Verbindung zu WhatsApp (Leitstand)

Siehe AnimaLine `docs/2026-11-19-baileys-connection-contract.md`:

- `GET /api/animaline/connection`: `admin`, `verwaltung`; `status` = `not_connected | code_ready | connected | disconnected`, `pairingCode`, `pairingCodeExpiresAt`, `lastConnectedAt`, `lastDisconnectedAt`, `failedConnections`, `stopped`, `updatedAt`.
- `POST /api/animaline/connection` mit `{ "action": "pairing_code" | "retry" }`: nur `admin`, gleiche Herkunft erforderlich.

## Regelbuch (Anima Cura)

- `GET /api/animahost/whatsapp/rules`: `admin`, `verwaltung`. Antwort `{ settings, activeVersion, rules }`. Mit `?history=1` zusätzlich `versions: [{version,createdAt,createdBy}]` (maximal 50).
- `POST /api/animahost/whatsapp/rules`: `admin`, `verwaltung`, gleiche Herkunft. Body `{ expectedVersion: number | null, rules: [{id,topic,keywords,action,patientText}] }`. `action` = `antworten | klaerfall | notfall`. Jede Veröffentlichung erzeugt eine unveränderliche Version; Antwort `{version,createdBy}`. Bei konkurrierender Änderung: HTTP 409 `rulebook_stale`; ungültige/gefährliche Antwort: HTTP 422 `rulebook_invalid`; fehlende Konfiguration: HTTP 503 `animahost_not_configured`.
- Die Einstellungen sind in `settings` lesbar. Ein Schreibendpunkt für Einstellungen und einzelne Regelaktionen folgt; die Oberfläche darf solche Änderungen bis dahin nicht als gespeichert anzeigen.

## Entscheidung zwischen AnimaLine und AnimaHost

`POST /api/animahost/whatsapp` ist ausschließlich ein Server-zu-Server-Endpunkt mit Bearer-Geheimnis. Body `{tenantId,messageId,from,text,messageType,receivedAt}`. Antwort `{action,text,rule}`. Gleiche `messageId` liefert dieselbe gespeicherte Entscheidung. Bei fehlender freigegebener Regel oder nicht bestandenem Modelltest bleibt die Antwort `klaerfall`. Notfälle werden vor Modellaufruf erkannt. Automatische Antworten sind bis zum bestandenen 26-Fälle-Test abgeschaltet.

## Noch nicht als API verfügbar

Die drei Arbeitslisten mit vollständigem Chatverlauf, Übernehmen/Freigeben eines Chats, Praxisantworten, „Künftig immer so beantworten“, Einstellungsänderungen und Push an Praxisgeräte haben noch keinen freigegebenen Browser-Vertrag. Die Glocke für Klärfälle/Notfälle ist vorbereitet. Claude soll diese Oberflächen erst an einen geprüften Endpunkt anschließen.
