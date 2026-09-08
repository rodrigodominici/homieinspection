-- Internal helpers & trigger functions: revoke the implicit PUBLIC grant.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_comercial() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_visible_checkout_for_comercial(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_markets(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_market(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_quien_repara_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC;

-- Business RPCs: signed-in users only.
REVOKE EXECUTE ON FUNCTION public.finalize_inspection(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.executive_force_close_owner_feedback(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_inspection_from_event(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_executive_performance(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_inspector_performance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_inspection(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.executive_force_close_owner_feedback(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_inspection_from_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_executive_performance(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inspector_performance(text) TO authenticated;

-- Public report access stays reachable through the shared link.
REVOKE EXECUTE ON FUNCTION public.get_published_report(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_owner_feedback(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_report(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_owner_feedback(text, text, text, jsonb) TO anon, authenticated;