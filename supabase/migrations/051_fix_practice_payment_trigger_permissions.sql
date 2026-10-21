-- Practice staff may create a cash/card receipt, but the append-only payment
-- ledger remains inaccessible to authenticated clients. The receipt trigger is
-- the trusted bridge and therefore runs as its postgres owner.
DO $$
BEGIN
  IF to_regprocedure('public.ledger_record_practice_payment()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.ledger_record_practice_payment() SECURITY DEFINER';
    EXECUTE 'ALTER FUNCTION public.ledger_record_practice_payment() SET search_path = public, pg_temp';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ledger_record_practice_payment() FROM PUBLIC';
  END IF;
END;
$$;
