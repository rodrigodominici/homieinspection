REVOKE EXECUTE ON FUNCTION public.receiver_type_allowed(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_advisor_performance(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.receiver_type_allowed(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_advisor_performance(text) TO authenticated;