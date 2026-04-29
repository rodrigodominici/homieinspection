## Diagnosis

The `admin-create-user` edge function exists and is reachable (a direct `POST` returns HTTP 500 — not 404), so the function is deployed. The crash happens before it can return a structured response, which is why the browser shows the generic Supabase JS message **"Failed to send a request to the Edge Function"**.

### Root cause

The function pins an old client:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
...
const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
```

`auth.getClaims()` was introduced in **supabase-js 2.50+**. On 2.45.0 the call throws `TypeError: userClient.auth.getClaims is not a function` during request handling, the function returns 500 with no body, and the JS client surfaces it as a network-level failure.

A direct curl against `/admin-create-user` confirms: status 500, body "Internal Server Error" — function is found and invoked, just crashing inside.

### Ruling out the other suspects

1. Function **exists and is deployed** (curl reaches it, 500 not 404).
2. Frontend **call name and body shape are correct** (`admin-create-user`, fields match `CreateUserBody`).
3. **Auth/JWT model is fine**: function does in-code validation via service role + `getClaims`; no `verify_jwt = false` override needed once the API call works.
4. **Secrets are present**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are all configured.
5. The failure mode is **runtime crash inside the function** (item 5 in the brief).

## Fix

### 1. Bump the Supabase client in `admin-create-user`

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
```

This makes `getClaims(token)` available and matches the version used by the other working functions (`process-communication-event`).

### 2. Apply the same bump to other functions that use `getClaims`

`recover-stalled-events/index.ts` also calls `getClaims` against 2.45.0 and would crash the moment it's invoked authenticated. Bump it to 2.50.0 as well so we don't trade one bug for another.

(`hubspot-*` and `retry-source-event` on 2.45.0 don't use `getClaims`, so they keep working — leaving them alone to minimize blast radius.)

### 3. Make the frontend error message useful when the function crashes

When the function returns a non-2xx with no JSON body, `supabase.functions.invoke` produces an error with no `context.error`, and the user sees the unhelpful "Failed to send a request to the Edge Function". Add a fallback:

```ts
const msg =
  code === 'email_exists' ? '...' :
  ...
  error.message?.includes('Failed to send a request')
    ? 'El servicio de creación de usuarios no respondió. Intenta nuevamente o revisa los logs.'
    : error.message;
```

This is cosmetic but prevents the same diagnosis loop next time something crashes server-side.

### 4. Verify end-to-end

After the edits:
- Re-deploy `admin-create-user` and `recover-stalled-events`.
- `curl POST /admin-create-user` with an empty body should now return **401 `unauthorized`** (the in-code JWT check), not 500.
- From the Admin > Usuarios screen, creating a user with a fresh email/password/role/market/phone should succeed and the new profile should appear in the list.

## Technical notes

- No `supabase/config.toml` changes needed. `admin-create-user` should keep default JWT verification off via in-code validation; we don't add a `[functions.admin-create-user]` block.
- No new secrets needed.
- No DB migrations.
- Files touched:
  - `supabase/functions/admin-create-user/index.ts` (version bump only)
  - `supabase/functions/recover-stalled-events/index.ts` (preventive version bump)
  - `src/pages/admin/AdminUsers.tsx` (friendlier error message)

## Final summary the user will get after implementation

- **Root cause**: `admin-create-user` was pinned to `supabase-js 2.45.0`, which doesn't have `auth.getClaims()`. The call threw at runtime, the function returned a bare 500, and the client surfaced it as "Failed to send a request to the Edge Function".
- **What changed**: bumped the client to 2.50.0 in `admin-create-user` (and preventively in `recover-stalled-events`), and improved the frontend error message for opaque function failures.
- **Reachability**: the function was already deployed and reachable — it just crashed inside. After the bump it returns proper 401/400/200 responses.
- **Outcome**: Admin can create users end-to-end again from Admin > Usuarios.
