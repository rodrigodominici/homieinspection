-- lovable-cron-fallback-reviewed: Required one-minute retry window, at most 1440 runs per day while queue has work; armed on enqueue and unscheduled on drain, never a permanent sweeper.
CREATE OR REPLACE FUNCTION public.rm_sync_dispatch_schedule() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(721091145);
 IF EXISTS(SELECT 1 FROM public.rent_manager_dispatch_config WHERE id AND endpoint<>'') AND EXISTS(SELECT 1 FROM public.rent_manager_outbox WHERE status IN ('pending','sending') OR (status='error' AND next_attempt_at IS NOT NULL)) THEN
  PERFORM cron.schedule('rent-manager-pending-wake','* * * * *','SELECT public.rm_wake_dispatch();');
 ELSE
  BEGIN PERFORM cron.unschedule('rent-manager-pending-wake'); EXCEPTION WHEN undefined_object THEN NULL; WHEN internal_error THEN NULL; END;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.rm_sync_dispatch_schedule() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm_sync_dispatch_schedule() TO service_role;
CREATE OR REPLACE FUNCTION public.rm_outbox_wakeup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM public.rm_sync_dispatch_schedule(); PERFORM public.rm_wake_dispatch(); RETURN NULL; END $$;
CREATE OR REPLACE FUNCTION public.rm_outbox_schedule_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM public.rm_sync_dispatch_schedule(); RETURN NULL; END $$;
REVOKE ALL ON FUNCTION public.rm_outbox_schedule_changed() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER rm_outbox_schedule_changed AFTER UPDATE OF status,next_attempt_at OR DELETE ON public.rent_manager_outbox FOR EACH STATEMENT EXECUTE FUNCTION public.rm_outbox_schedule_changed();
CREATE OR REPLACE FUNCTION public.rm_configure_dispatch(p_url text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'system_required'; END IF;
 IF p_url IS NULL OR p_url !~ '^https://[^/]+/functions/v1/rent-manager-dispatch$' THEN RAISE EXCEPTION 'invalid_dispatch_url'; END IF;
 INSERT INTO public.rent_manager_dispatch_config(id,endpoint) VALUES(true,p_url) ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint;
 PERFORM public.rm_sync_dispatch_schedule(); PERFORM public.rm_wake_dispatch();
END $$;