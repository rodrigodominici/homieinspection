GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_comercial() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_visible_checkout_for_comercial(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_markets(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_market(uuid, text) TO anon, authenticated;