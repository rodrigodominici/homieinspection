# Slack link accesible para admin y ejecutivo

## Contexto verificado

- El edge function `notify-executive-slack` genera el link como `${APP_BASE_URL}/executive/review/${insp.id}` (línea 124).
- En `src/App.tsx` **no existe** la ruta `/executive/review/:id`. Las rutas reales son:
  - `/executive/inspection/:id` → `ProtectedRoute allowedRoles={['executive']}`
  - `/admin/inspections/:id` → `ProtectedRoute allowedRoles={['admin']}`
- Por eso hoy el botón "Revisar inspección" en Slack **no funciona ni para ejecutivo ni para admin** (URL rota), y aunque apuntara al workstation ejecutivo, un admin sería rechazado por `ProtectedRoute`.

## Solución propuesta

Introducir una **ruta puente compartida** que decida el destino según el rol del usuario autenticado, y usarla como URL única en las notificaciones de Slack.

1. Nueva ruta pública-tras-login `/inspections/:id` (sin restricción por rol, solo autenticación):
   - Si el usuario tiene rol `admin` → `Navigate` a `/admin/inspections/:id`.
   - Si es `executive` → `/executive/inspection/:id`.
   - Si es `inspector` → `/inspector/inspection/:id` (por consistencia, opcional).
   - Si no está autenticado → `ProtectedRoute` ya redirige a `/auth` conservando `returnTo`, así al iniciar sesión aterriza en el link correcto.

2. Actualizar `supabase/functions/notify-executive-slack/index.ts` para que ambos botones (`submitted` y `owner_feedback`) usen:
   ```
   const link = `${APP_BASE_URL}/inspections/${insp.id}`;
   ```
   No republicar notificaciones existentes; solo cambia el destino de los futuros mensajes.

3. Actualizar el copy del botón de `"Revisar inspección"` a `"Abrir inspección"` (más neutro para ambos roles). El de `owner_feedback` queda como `"Ver feedback"`.

## Detalles técnicos

- Archivo nuevo: `src/pages/InspectionRoleRedirect.tsx` — usa `useAuth()` para leer el rol activo y hace `<Navigate replace to={...}/>`. Mientras `role` carga, muestra el mismo skeleton que usan las demás rutas protegidas.
- `src/App.tsx`: agregar
  ```tsx
  <Route path="/inspections/:id" element={
    <ProtectedRoute allowedRoles={['admin','executive','inspector']}>
      <InspectionRoleRedirect />
    </ProtectedRoute>
  } />
  ```
- `supabase/functions/notify-executive-slack/index.ts`: cambiar la construcción de `link` (una sola línea) y el texto del botón `submitted`.

## Fuera de alcance

- No se modifican los permisos de los reportes públicos (`/report/:token`).
- No se re-envían notificaciones ya enviadas.
- No se cambia la lógica de `ProtectedRoute` ni los roles existentes.
