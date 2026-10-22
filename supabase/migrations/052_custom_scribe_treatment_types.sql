-- Eigene Anima-Scribe-Behandlungsarten besitzen ab jetzt einen eigenen
-- technischen Schluessel. Die bisherigen Checks erlaubten nur die drei
-- Startvorlagen und verhinderten dadurch unabhaengige Praxisvorlagen.

ALTER TABLE IF EXISTS doku_vorlagen
  DROP CONSTRAINT IF EXISTS doku_vorlagen_behandlungsart_check;

ALTER TABLE IF EXISTS doku_vorlagen_optionen
  DROP CONSTRAINT IF EXISTS doku_vorlagen_optionen_behandlungsart_check;

ALTER TABLE IF EXISTS praxis_pass
  DROP CONSTRAINT IF EXISTS praxis_pass_behandlungsart_check;
