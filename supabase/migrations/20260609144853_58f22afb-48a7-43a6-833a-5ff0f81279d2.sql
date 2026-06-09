CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role / backend context (no JWT): permitir.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins autenticados pueden cambiar cualquier cosa.
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Usuarios no-admin: no pueden tocar campos sensibles.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Not allowed to change role';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Not allowed to change is_active';
  END IF;
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    RAISE EXCEPTION 'Not allowed to change approval_status';
  END IF;

  RETURN NEW;
END;
$$;