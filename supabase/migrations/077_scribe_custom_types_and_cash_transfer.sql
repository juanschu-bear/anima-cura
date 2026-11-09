-- Incident fix 09.11.2026: align existing UI choices with storage constraints.
-- No data updates, payments, confirmations, grants or RLS changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.doku_eintraege DROP CONSTRAINT doku_eintraege_behandlungsart_check;
ALTER TABLE public.doku_eintraege ADD CONSTRAINT doku_eintraege_behandlungsart_check
 CHECK (behandlungsart IN ('aligner','removable','multiband')
 OR behandlungsart ~ '^custom-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
ALTER TABLE public.kassen_zahlungen DROP CONSTRAINT kassen_zahlungen_zahlart_check;
ALTER TABLE public.kassen_zahlungen ADD CONSTRAINT kassen_zahlungen_zahlart_check
 CHECK (zahlart IN ('qr_ueberweisung','ueberweisung','girocard','kreditkarte','bar','guthaben'));
COMMIT;
