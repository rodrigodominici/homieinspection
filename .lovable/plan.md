## Diagnóstico

La edge function `admin-create-user` se ejecuta sin error en `auth.admin.createUser` (los logs confirman el `user_signedup`), pero **inmediatamente después borra al usuario recién creado** (`user_deleted` ~1s después). Esa secuencia es exactamente el flujo de cleanup del `catch` cuando falla el `UPDATE` del perfil (líneas 128‑132 del index.ts).

El UPDATE falla por culpa del trigger `trg_prevent_profile_privilege_escalation` sobre `public.profiles`:

```sql
IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
  RAISE EXCEPTION 'Not allowed to change is_active';
END IF;
...
```

La edge function corre con **service‑role key** → dentro del trigger `auth.uid()` es `NULL` → `has_role(NULL,'admin')` devuelve `false` → el trigger asume que es un usuario no‑admin y rechaza el cambio de `is_active` (de `false` a `true`) o de `approval_status` (de `'pending'` a `'approved'`). Se lanza la excepción, la función entra al `catch`, borra al auth user y responde 500.

Esto afecta a cualquier rol creado por esa edge function (admin, inspector, executive); el usuario lo notó al intentar crear un admin.

## Solución

Ajustar el trigger para que **distinga la ausencia de sesión (service‑role / contexto del backend) de un usuario autenticado sin privilegios**. El bypass por `auth.uid() IS NULL` es seguro porque:

- Las escrituras directas desde el cliente siempre llevan JWT → `auth.uid()` no es null.
- Solo el service‑role (edge functions, jobs internos) o llamadas a nivel de DB pueden tener `auth.uid()` null, y ya son canales confiables.
- RLS sigue siendo la primera línea de defensa para clientes anónimos/autenticados.

### Migración

```sql
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

  -- Admins autenticados: permitir cualquier cambio.
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Usuarios no-admin: no pueden tocar campos sensibles de su propio perfil.
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
```

## Validación post‑deploy

1. Desde el panel de Admin → Usuarios, crear un usuario con rol **admin** → debe devolver 200 y aparecer en la lista con `approval_status='approved'`, `is_active=true`.
2. Repetir con rol **inspector** y **executive** para confirmar que no se rompió el flujo existente.
3. Verificar que un usuario no‑admin logueado **no** pueda cambiar su propio `role` / `is_active` / `approval_status` desde el cliente (RLS + trigger lo siguen bloqueando).

## Alcance

- 1 migración (re‑definición de la función del trigger).
- Sin cambios en la edge function ni en el cliente.
