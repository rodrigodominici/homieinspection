ALTER TABLE public.rent_manager_outbox ADD COLUMN simulated_payload jsonb;
CREATE TABLE public.rent_manager_dispatch_wakes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),expires_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes');
GRANT ALL ON public.rent_manager_dispatch_wakes TO service_role;
ALTER TABLE public.rent_manager_dispatch_wakes ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.rent_manager_dispatch_config (id boolean PRIMARY KEY DEFAULT true CHECK(id),endpoint text NOT NULL);
GRANT ALL ON public.rent_manager_dispatch_config TO service_role;
ALTER TABLE public.rent_manager_dispatch_config ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.rm_wake_dispatch() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE endpoint text; nonce uuid;
BEGIN
 SELECT c.endpoint INTO endpoint FROM public.rent_manager_dispatch_config c WHERE c.id;
 IF endpoint IS NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rent_manager_outbox WHERE status IN ('pending','sending') OR (status='error' AND next_attempt_at IS NOT NULL)) THEN RETURN; END IF;
 INSERT INTO public.rent_manager_dispatch_wakes DEFAULT VALUES RETURNING id INTO nonce;
 PERFORM net.http_post(url:=endpoint,body:=jsonb_build_object('wake_id',nonce),headers:=jsonb_build_object('Content-Type','application/json'),timeout_milliseconds:=15000);
END $$;
CREATE OR REPLACE FUNCTION public.rm_consume_wake(p_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE consumed uuid;
BEGIN
 DELETE FROM public.rent_manager_dispatch_wakes WHERE id=p_id AND expires_at>now() RETURNING id INTO consumed;
 RETURN consumed IS NOT NULL;
END $$;
CREATE OR REPLACE FUNCTION public.rm_outbox_wakeup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM public.rm_wake_dispatch(); RETURN NULL; END $$;
CREATE TRIGGER rm_outbox_wakeup AFTER INSERT ON public.rent_manager_outbox FOR EACH STATEMENT EXECUTE FUNCTION public.rm_outbox_wakeup();
REVOKE ALL ON FUNCTION public.rm_wake_dispatch(),public.rm_consume_wake(uuid),public.rm_outbox_wakeup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm_wake_dispatch(),public.rm_consume_wake(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.rm_configure_dispatch(p_url text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'system_required'; END IF;
 IF p_url !~ '^https://[^/]+/functions/v1/rent-manager-dispatch$' THEN RAISE EXCEPTION 'invalid_dispatch_url'; END IF;
 INSERT INTO public.rent_manager_dispatch_config(id,endpoint) VALUES(true,p_url) ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint;
 PERFORM public.rm_wake_dispatch();
END $$;
REVOKE ALL ON FUNCTION public.rm_configure_dispatch(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm_configure_dispatch(text) TO service_role;
