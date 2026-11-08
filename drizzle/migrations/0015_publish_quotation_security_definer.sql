ALTER FUNCTION public.publish_quotation_version(uuid, jsonb) SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.publish_quotation_version(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_quotation_version(uuid, jsonb) TO authenticated;