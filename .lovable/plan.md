

## Diagnóstico

`retry-source-event` falla con `TypeError: userClient.auth.getClaims is not a function`. La versión de `@supabase/supabase-js@2.45.0` que importa esa función **no expone `getClaims()`** (esa API requiere v2.95+). El error revienta antes de validar al admin, por eso el cliente ve `Failed to send a request to the Edge Function` (la función no devuelve respuesta, crashea).

Las otras dos funciones (`hubspot-inspection-intake`, `recover-stalled-events`) usan otro método de validación, por eso no fallan.

## Fix (1 archivo)

**`supabase/functions/retry-source-event/index.ts`** — reemplazar la validación de auth por `getUser(token)`, que sí está disponible en 2.45.0 y verifica el JWT contra Supabase Auth:

```ts
const token = auth.replace('Bearer ', '');
const userClient = createClient(SUPABASE_URL, ANON_KEY);
const { data: userData, error: userErr } = await userClient.auth.getUser(token);
if (userErr || !userData?.user?.id) {
  return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: ... });
}
const userId = userData.user.id;
```

El resto del flujo (chequeo de `profiles.role = 'admin' && is_active`, validaciones del row, RPC, registro de intento) queda igual.

No se toca `config.toml`, ni la RPC, ni el UI. Una vez deployada, el botón **Reintentar** sobre `d62acc32` debe ejecutar la RPC ya corregida y dejar el evento en `completed` con la inspección en `pending_assignment`.

