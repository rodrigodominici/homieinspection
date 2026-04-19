

## Diagnóstico

El payload es válido pero usa **forma anidada** (`inspector: { email }`) mientras que el resolver actual solo lee **forma plana** (`inspector_email`). Resultado: ambos slots quedan como `absent`, no se resuelven IDs, y la inspección termina en `pending_assignment` aunque los emails existen en `profiles`.

```text
payload.data.inspector.email   ← forma enviada (anidada)
payload.data.inspector_email   ← única forma que el resolver lee hoy
```

Confirmado en `validateEnvelope` (líneas 41–45) y en la llamada `resolveAssignment(body.data.inspector_email, ...)` del intake.

## Decisión: arreglar el procesamiento, no el payload

La forma anidada `{ inspector: { email }, executive: { email } }` es la que ya documenta el contrato canónico (`PropertyPayload` en `src/lib/types.ts`) y la que usan los flujos manuales. El intake debe aceptarla como entrada primaria; los campos planos quedan como compat.

## Cambio (1 archivo)

**`supabase/functions/hubspot-inspection-intake/index.ts`**

1. **Helper de extracción** que prefiere anidado y cae a plano:
   ```ts
   function extractSlotEmail(data: any, slot: 'inspector' | 'executive'): string | null {
     const nested = data?.[slot]?.email;
     const flat = data?.[`${slot}_email`];
     const v = (typeof nested === 'string' && nested) ? nested
             : (typeof flat   === 'string' && flat)   ? flat
             : null;
     return v ? v.trim().toLowerCase() : null;
   }
   ```

2. **Validador**: aceptar ambas formas. Validar que si `data.inspector` existe sea objeto y que `email` (cuando esté) sea string. Mismo para `executive`. Mantener la validación actual de `inspector_email`/`executive_email` planos.

3. **Llamadas a `resolveAssignment`**: usar `extractSlotEmail(body.data, 'inspector' | 'executive')` en lugar de leer el campo plano.

4. **El bloque `__assignment__`** sigue registrando `input_email` con el valor extraído, así el panel de Logs muestra exactamente lo que se intentó resolver, sin importar la forma de entrada.

No se toca el RPC, ni el constraint, ni el UI de Logs (que ya soporta el panel de resolución).

## Resultado esperado

Con el mismo payload del usuario:
- `inspector.email = alejandra.rodriguez@homierent.com` → resuelve vía `mapping` o `profiles` → ID inyectado.
- `executive.email = tomas.alvarez@homierent.com` → resuelve igual → ID inyectado.
- RPC computa `status = 'assigned'`.

Si alguno no existe en BD, queda `pending_assignment` (válido en el constraint actual) con el panel de Logs mostrando el paso fallido.

## Acción adicional sugerida (opcional, después del fix)

Reintentar el evento `hs_evt_deal_48862344351` desde `/admin/integrations/hubspot/logs` una vez deployada la función para validar end-to-end.

