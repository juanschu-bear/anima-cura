# Tagesdatensatz: vier Backend-Korrekturen

Implementiert: entscheidungsabhängige Vorschau (auch Bootstrap kind=null), HTTP 409 bei bereits bestätigtem Patiententag, HTTP 409 für direkte Versionierung eines kanonischen Eintrags, Herkunftsmetadaten je Klärfall-Kandidat im Leitstand.

60 Scribe-Tests und Build bestanden. `node scripts/test-scribe-day-guards.mjs` testet in einem isolierten, danach entfernten PostgreSQL-17-Container zwei gleichzeitige Neuanlagen sowie zwei gleichzeitige Entwurfsbestätigungen. Jeweils nur eine Bestätigung gelingt. Der kanonische Inhalt bleibt gegen direkte Nutzeränderungen geschützt; autorisierte Tagesbefehle bleiben möglich.

Zusätzliche Migration 076 bereitet zwei Guards und eine interne eindeutige Tagesreservierung vor. Keine historischen Patienteneinträge werden bei der Migration verändert. **SQL nur vorbereitet, nicht ausgeführt.** Ohne 076 bleibt das Rennen zweier Bestätigungen trotz API-Vorcheck offen. 075 bleibt unverändert. Die letzte belegte Ausführungsprüfung im anderen Scribe-Chat meldet 075 und Leitstand 009 noch nicht ausgeführt (Browserlauf unterbrochen). Keine neue Live-Zählung in diesem Auftrag.

Leitstand benötigt zusätzlich die lesende Sicht aus Migration 013. Die vollständigen Antwortfelder und die Reihenfolge für den Livegang stehen im Leitstand-Repo unter `docs/2026-11-05-tagesdatensatz-backend-fixes.md`.

SHA-256 075: `3a33b7d9610a84cd789fa98d34a3c40f18c69befb8c246d4beda365d83944cbe`

SHA-256 076: `0fcbca723a8d7b278f1f23d98e7ae9981dc8045f8d59876a03310b682b7bf29e`

Keine UI-Änderungen durch diesen Auftrag. Vorhandene fremde Änderungen im Arbeitsverzeichnis bleiben unangetastet und werden nicht mitcommittet.
