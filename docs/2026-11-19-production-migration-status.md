# Produktionsmigrationen 086 und 087

Stand 19.11.2026. Juan hat beide Dateien im SQL-Editor ausgeführt. Nicht erneut ausführen.

| Migration | SHA-256 der archivierten Datei | Prüfung |
| --- | --- | --- |
| `086_invoice_delivery_failure_holds.sql` | `cc3e63c1f08148042786293e8201eae9048621c23588ea252bf2f4f0093b6c80` | Juan meldet erfolgreiche Ausführung. Die Lesetabelle `invoice_delivery_holds` ist erreichbar; aktuell 0 Zeilen mit `email_rejected`/`email_complaint`. Die neue Check-Constraint ist ohne SQL-Zugang noch nicht direkt geprüft. |
| `087_animahost_whatsapp_rulebook.sql` | `0ecd64dfee74e929df49fcfbf732f08aca9fcb578da61e901255a3b0c10956b2` | Produktionslesetest: Mandant vorhanden, Modell `anthropic/claude-haiku-5.5`, Spracheingabe und Sprachausgabe aus, 0 Regelversionen, 0 Entscheidungen. Anonymer Tabellenzugriff wird mit `42501` verweigert. |

Die Migrationen wurden über den SQL-Editor ausgeführt. Ob die separate Supabase-CLI-Historie (`supabase_migrations.schema_migrations`) die Versionen 086 und 087 enthält, ist ohne Management- oder PostgreSQL-Zugang nicht prüfbar. Vor einem späteren `db push` muss die Historie nach der offiziellen Anleitung mit `supabase migration list --remote` geprüft und gegebenenfalls mit `supabase migration repair --status applied <version> --remote` berichtigt werden. Das führt die SQL-Dateien nicht erneut aus.
