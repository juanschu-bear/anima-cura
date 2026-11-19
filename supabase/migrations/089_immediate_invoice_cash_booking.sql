-- One SQL-Editor statement. This protected function records a reception payment
-- through the existing Kasse trigger and keeps retries idempotent.
DO $install$ BEGIN
 IF to_regclass('public.kassen_zahlungen') IS NULL
    OR to_regclass('public.anima_balance_buchungen') IS NULL
    OR to_regclass('public.user_profiles') IS NULL
 THEN RAISE EXCEPTION 'immediate_cash_precondition_failed'; END IF;

 CREATE TABLE public.immediate_invoice_payment_commands (
  command_id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL,
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  actor_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK(amount_cents>0),
  invoice_number text NOT NULL,
  payment_method text NOT NULL CHECK(payment_method IN
   ('bar','girocard','kreditkarte','qr_ueberweisung','ueberweisung','guthaben')),
  kassen_zahlung_id uuid NOT NULL UNIQUE REFERENCES public.kassen_zahlungen(id),
  payment_state text NOT NULL CHECK(payment_state IN ('received','awaiting_bank')),
  created_at timestamptz NOT NULL DEFAULT now()
 );
 ALTER TABLE public.immediate_invoice_payment_commands ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.immediate_invoice_payment_commands FROM PUBLIC,anon,authenticated,service_role;

 CREATE FUNCTION public.record_immediate_invoice_payment(
  p_command_id uuid,p_invoice_id uuid,p_patient_id uuid,p_actor_id uuid,
  p_amount_cents bigint,p_payment_method text,p_invoice_number text
 ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $body$
 DECLARE saved public.immediate_invoice_payment_commands%ROWTYPE;
  receipt_id uuid;state text;available numeric(12,2);
 BEGIN
  IF p_command_id IS NULL OR p_invoice_id IS NULL OR p_patient_id IS NULL OR p_actor_id IS NULL
   OR p_amount_cents IS NULL OR p_amount_cents<=0 OR p_amount_cents>999999999
   OR p_payment_method IS NULL OR p_payment_method NOT IN ('bar','girocard','kreditkarte','qr_ueberweisung','ueberweisung','guthaben')
   OR p_invoice_number IS NULL OR p_invoice_number !~ '^AC-SR-[0-9]{4}-[0-9]{6}$'
  THEN RAISE EXCEPTION 'immediate_payment_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=p_actor_id AND role IN ('admin','verwaltung'))
  THEN RAISE EXCEPTION 'immediate_payment_forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('immediate-payment:'||p_command_id::text,0));
  SELECT * INTO saved FROM public.immediate_invoice_payment_commands WHERE command_id=p_command_id;
  IF FOUND THEN
   IF saved.invoice_id<>p_invoice_id OR saved.patient_id<>p_patient_id
     OR saved.actor_id<>p_actor_id OR saved.amount_cents<>p_amount_cents
     OR saved.payment_method<>p_payment_method OR saved.invoice_number<>p_invoice_number
   THEN RAISE EXCEPTION 'immediate_payment_command_reused'; END IF;
   RETURN jsonb_build_object('kassenZahlungId',saved.kassen_zahlung_id,
    'paymentState',saved.payment_state,'amountCents',saved.amount_cents,'replayed',true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.patients WHERE id=p_patient_id)
  THEN RAISE EXCEPTION 'immediate_payment_patient_missing'; END IF;
  IF p_payment_method='guthaben' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('balance:'||p_patient_id::text,0));
   SELECT coalesce(sum(betrag),0) INTO available FROM public.anima_balance_buchungen
    WHERE patient_id=p_patient_id;
   IF available < p_amount_cents::numeric/100
   THEN RAISE EXCEPTION 'immediate_payment_credit_insufficient'; END IF;
  END IF;
  state:=CASE WHEN p_payment_method IN ('qr_ueberweisung','ueberweisung')
   THEN 'awaiting_bank' ELSE 'received' END;
  INSERT INTO public.kassen_zahlungen
   (patient_id,betrag,buchungstyp,zahlart,kassen_datum,zweck,notiz)
  VALUES(p_patient_id,p_amount_cents::numeric/100,'einnahme',p_payment_method,
   (now() AT TIME ZONE 'Europe/Berlin')::date,
   'Sofortrechnung '||p_invoice_number,'Sofortrechnung '||p_invoice_id::text)
  RETURNING id INTO receipt_id;
  IF p_payment_method='guthaben' THEN
   INSERT INTO public.anima_balance_buchungen
    (patient_id,betrag,typ,beschreibung,referenz_kassen_zahlung_id)
   VALUES(p_patient_id,-p_amount_cents::numeric/100,'verrechnung',
    'Sofortrechnung '||p_invoice_number,receipt_id);
  END IF;
  INSERT INTO public.immediate_invoice_payment_commands
   (command_id,invoice_id,patient_id,actor_id,amount_cents,invoice_number,payment_method,kassen_zahlung_id,payment_state)
  VALUES(p_command_id,p_invoice_id,p_patient_id,p_actor_id,p_amount_cents,p_invoice_number,p_payment_method,receipt_id,state);
  RETURN jsonb_build_object('kassenZahlungId',receipt_id,
   'paymentState',state,'amountCents',p_amount_cents,'replayed',false);
 END $body$;
 REVOKE ALL ON FUNCTION public.record_immediate_invoice_payment(uuid,uuid,uuid,uuid,bigint,text,text)
  FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.record_immediate_invoice_payment(uuid,uuid,uuid,uuid,bigint,text,text)
  TO service_role;
END $install$;
