Du arbeitest am Backend von Anima Cura, einem Next.js 14 Praxisverwaltungstool. Das Repo ist github.com/juanschu-bear/anima-cura.

Lies zuerst CODEX_BACKEND_BRIEFING.md im Root des Repos. Das Briefing enthält alle Aufgaben, Dateien, Schemas, Prompts und Abhängigkeiten.

Erstelle die 5 Dateien + Cron-Erweiterung exakt wie im Briefing beschrieben. Installiere `resend` und `zod` als Dependencies. Teste dass der Build durchgeht (`npm run build`).

Wichtig:
- Alle API Routes brauchen `export const runtime = "nodejs"`
- Server-Client: `import { createServerClient } from "@/lib/db/supabase"`
- SSE-Streaming für den AI-Assist-Endpoint
- Zod-Validierung auf alle Tool-Outputs
- Keine Frontend-Änderungen
- Alle Texte auf Deutsch
