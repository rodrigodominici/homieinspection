-- Internal helpers & trigger functions: not part of the public API.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_comercial() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_visible_checkout_for_comercial(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_markets(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_has_market(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_quien_repara_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM anon, authenticated;

-- Business RPCs: signed-in users only.
REVOKE EXECUTE ON FUNCTION public.finalize_inspection(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.executive_force_close_owner_feedback(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_inspection_from_event(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_executive_performance(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_inspector_performance(text) FROM anon;