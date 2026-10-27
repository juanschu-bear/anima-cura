-- Prepared scheduler infrastructure only. Apply separately after approved release time.
BEGIN;
CREATE TABLE public.animasign_dispatch_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  generation integer NOT NULL DEFAULT 0 CHECK(generation>=0),
  attempted_at timestamptz
);
INSERT INTO public.animasign_dispatch_gate(singleton) VALUES(true);
CREATE FUNCTION public.guard_animasign_dispatch_gate() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.attempted_at IS NOT NULL AND clock_timestamp() < OLD.attempted_at + interval '5 minutes' THEN
    RETURN NULL;
  END IF;
  NEW.singleton := true;
  NEW.generation := OLD.generation + 1;
  NEW.attempted_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_animasign_dispatch_gate() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER enforce_animasign_dispatch_gate BEFORE UPDATE ON public.animasign_dispatch_gate
FOR EACH ROW EXECUTE FUNCTION public.guard_animasign_dispatch_gate();
ALTER TABLE public.animasign_dispatch_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.animasign_dispatch_gate FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.animasign_dispatch_gate TO service_role;
GRANT UPDATE(generation) ON public.animasign_dispatch_gate TO service_role;
COMMIT;
