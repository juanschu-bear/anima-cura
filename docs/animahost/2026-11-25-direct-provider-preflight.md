# Direkte Anthropic-Anbindung: Vorprüfung

Juan hat die getrennten Variablen `ANIMAHOST_ANTHROPIC_LIVE_KEY` und `ANIMAHOST_ANTHROPIC_TEST_KEY` in Production als Sensitive hinterlegt. Die Vercel-API bestätigt beide Namen und den Typ, nicht ihre Funktionsfähigkeit.

Wichtige Korrektur: `vercel env pull` exportiert Sensitive-Werte leer. Der frühere lokale HTTP-401-Test verwendete daher keinen ausgelesenen Schlüssel und belegt NICHT, dass der alte Anthropic-Schlüssel ungültig ist.

Die opt-in Build-Prüfung `ANIMAHOST_DIRECT_KEY_CHECK=1` ruft ausschließlich `GET https://api.anthropic.com/v1/models` auf. Kein Generieren, keine Patientendaten, keine Schlüsselwerte/Fingerprints im Ergebnis. Ausgegeben werden Vorhandensein, unterschiedliche Werte, HTTP-Status und freigegebene Haiku-Modell-IDs. Das beweist weder Guthaben noch Workspace-Trennung, Tageslimit oder Aufbewahrungsvereinbarung. Unabhängige Tests laufen mit simuliertem HTTP-Zugang.

Die aktuelle Live-Konfiguration verlangt EU-Verarbeitung und Zero Data Retention (`gatewayOptions`). Anthropic dokumentiert für die direkte API aktuell globale oder US-Inferenz, keine EU-only-Option. Deshalb noch keine automatische Umschaltung von Patientenantworten. Rückfrage zur bestehenden Organisationsvereinbarung bzw. Beibehaltung der EU-Vorgabe ist offen.

Quelle: https://platform.claude.com/docs/en/manage-claude/data-residency

Offen bleiben: tatsächliche Schlüsselprüfung im Server-Build, verifizierte Workspaces und Budgets, harte zentrale 2-USD-Tagesgrenze für Tests, vollständiger Verbrauchsnachweis seit 24.11., gezielte Wiederverwendung unveränderter Replay-Fälle und produktiver Providerwechsel. Die bloße Existenz zweier Schlüssel erfüllt diese Anforderungen nicht.
