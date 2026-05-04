# Diagnóstico real: por qué no se pueden agregar reparaciones

## Lo que ya descartamos con datos

Consulté la base de datos en vivo:

- La inspección **Radal 0102 D 1612** tiene `executive_id = 21508f9b…` = **David Chávez**.
- Tu sesión visible en la UI es David Chávez.
- Las políticas RLS de `inspection_repair_items` permiten a un ejecutivo gestionar las reparaciones de inspecciones donde `inspections.executive_id = auth.uid()`.

**Conclusión:** la asignación está correcta y RLS debería permitir la operación. El bloqueo real es otro. Mi diagnóstico anterior (reasignar al ejecutivo) no resuelve nada.

## Hipótesis a verificar

1. **JWT viejo en el navegador** — la UI dice "David", pero el token de sesión apunta a otro `auth.uid()`. RLS evalúa el token, no el email.
2. **Insert silenciosamente fallando** — el código que agrega reparaciones no muestra toast cuando RLS o un NOT NULL rechazan el insert; el botón parece "no hacer nada".
3. **Validación frontend** — algún `disabled` o early-return bloquea el flujo en estado `in_review` (aunque el código teórico lo permite).
4. **Catálogo de reparaciones inaccesible** — RLS del catálogo bloquea la lectura, el diálogo abre vacío, no se puede seleccionar nada.

## Plan de trabajo

### Paso 1 — Instrumentar el flujo de "agregar reparación" (5 min)

- Leer `QuotationDialog.tsx` y la pantalla `ExecutiveReviewDetail.tsx` donde se dispara la creación de reparaciones.
- Identificar el `supabase.from('inspection_repair_items').insert(...)` y revisar si el `error` se está mostrando.
- Verificar que se envían todos los NOT NULL: `inspection_id`, `inspection_section_id`, `title_snapshot`, `unit`, `pricing_type`, `quantity`, `unit_price`.

### Paso 2 — Validar la sesión real

- Confirmar en consola que `auth.uid()` del JWT actual corresponde a `21508f9b…`. Si no, forzar logout/login.

### Paso 3 — Verificar RLS del catálogo

```sql
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'repair_catalog_items';
```

Si los ejecutivos no tienen `SELECT`, el diálogo aparece sin opciones.

### Paso 4 — Fix mínimo

Según lo que aparezca, aplicar **una** de estas correcciones:

- **A.** Mostrar el `error.message` real en un toast cuando el insert falle (corrige el "no pasa nada" silencioso, sirva o no para esta sesión).
- **B.** Agregar `SELECT` para ejecutivos en `repair_catalog_items` si falta.
- **C.** Corregir el payload del insert si está incompleto.
- **D.** Si el JWT está stale, agregar un re-fetch de sesión + invalidar al cambiar de cuenta.

El fix **A (toasts honestos en errores de Supabase)** se aplicará siempre, porque es la causa de toda la confusión: sin error visible, no podemos saber qué rechazó el insert.

## Lo que NO se va a hacer

- No reasignar la inspección (ya está bien asignada).
- No abrir las políticas RLS para "todos los ejecutivos" — eso era un parche basado en un diagnóstico equivocado.
- No tocar el flujo de estados.

## Entregable

Tras aplicar el fix:

- El botón de agregar reparación funciona, **o** muestra un toast claro con el motivo exacto del rechazo (RLS, NOT NULL, validación).
- Resumen final: causa raíz verificada + cambio aplicado.
