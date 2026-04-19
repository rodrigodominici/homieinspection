

## Diagnóstico

El error **"query has no destination for result data"** **NO** viene de los emails `null` (eso está bien manejado: ambos slots quedan `absent` → `pending_assignment`, que es válido en el constraint).

El error viene de la **RPC `create_inspection_from_event`**, en este bloque CTE:

```sql
WITH inserted_sections AS (INSERT ... RETURNING ...),
     inserted_fields  AS (INSERT ... RETURNING 1)
SELECT 1;   -- ← finalize CTE
```

En PL/pgSQL, una sentencia `SELECT` que devuelve filas **debe** ir a `INTO`, `PERFORM`, o `RETURN QUERY`. El `SELECT 1;` final no tiene destino, y por eso Postgres lanza `query has no destination for result data` y la inspección **nunca se inserta** (todo el bloque revierte por la transacción del `BEGIN ... EXCEPTION`).

Por qué este evento sí lo dispara y otros parecidos no: la RPC se ejecuta **siempre**, pero el bug solo se manifiesta cuando el CTE realmente corre hasta el `SELECT 1` final (cualquier evento que llegue al insert de inspections lo hace). Otros eventos antiguos fallaron antes por el constraint `pending_assignment`, ocultando este bug.

Confirmación: el payload de este evento es válido, la sección generada (`__generated__.sections`) existe (1 sección "introduction"), y el status que computaría la RPC es `pending_assignment` (ya soportado). No hay ningún otro motivo para fallar.

## Fix (1 cambio, en una migración)

Reemplazar el `SELECT 1;` huérfano por `PERFORM 1 FROM inserted_fields;` (o cambiar todo el CTE por sentencias separadas). La opción mínima y segura:

```sql
-- dentro de create_inspection_from_event, donde hoy dice:
--   ... )
--   SELECT 1; -- finalize CTE
-- pasarlo a:
PERFORM 1
FROM (
  WITH inserted_sections AS (
    INSERT INTO public.inspection_sections (...) SELECT ... RETURNING id, section_key
  ),
  inserted_fields AS (
    INSERT INTO public.inspection_field_values (...) SELECT ... RETURNING 1
  )
  SELECT 1 AS done
) cte;
```

`PERFORM` descarta el resultado correctamente y satisface a PL/pgSQL. No cambia ninguna lógica de inserción ni el orden.

No hay cambios en la edge function, ni en el constraint, ni en el UI.

## Acción posterior

Una vez aplicada la migración, hacer click en **"Reintentar"** sobre el evento `d62acc32` (`hs_evt_deal_38462011782`). Debe quedar en `completed` con la inspección creada en estado `pending_assignment` (porque ambos emails son `null`).

