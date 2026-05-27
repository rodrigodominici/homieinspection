## Objetivo

En `AdminDashboard.tsx`, la tarjeta **Pendientes por Inspector** muestra nombres con conteos pero no es interactiva. Convertir cada fila en un enlace que lleve a `/admin/inspections` con el filtro de inspector ya aplicado.

## Cambios

### 1. `src/pages/admin/AdminInspections.tsx`
- Leer `inspector` (y opcionalmente `status`) desde `searchParams` al montar e hidratar `inspectorFilter` con ese valor.
- Mantener sincronizada la URL cuando el usuario cambie el filtro (igual que ya se hace con `view`), para que el estado del filtro sea compartible y persista.

### 2. `src/pages/admin/AdminDashboard.tsx`
- Reemplazar cada fila `<div>` de la lista "Pendientes por Inspector" por un `<Link>` (de `react-router-dom`) a `/admin/inspections?inspector=<id>&status=pending` (o sólo `inspector=<id>` — ver pregunta abajo).
- Conservar estilo actual (nombre a la izquierda, badge a la derecha) y añadir hover sutil (`hover:bg-muted/50 rounded-md px-2 -mx-2`) para indicar accionabilidad.
- Aplicar el mismo patrón a "Por Revisar por Ejecutivo" (`?executive=<id>`) y a "Sin Asignar" (`?bucket=unassigned`) para consistencia, ya que comparten el mismo problema.

## Detalle técnico

- El parámetro `inspector` espera el `profile.id` (UUID). El `<Select>` ya usa ese valor (`SelectItem value={p.id}`), por lo que pre-cargar `inspectorFilter` con el query param funciona sin transformación.
- `bucketFilter` ya acepta los valores `'unassigned' | 'missing_inspector' | 'missing_executive' | 'all'`.

## Pregunta abierta

¿El link debe filtrar también por estado (sólo las "pendientes": `assigned`, `in_progress`, `needs_changes`) o mostrar todas las inspecciones del inspector y dejar que el admin afine? Recomiendo lo primero porque el conteo en la tarjeta corresponde exactamente a ese subconjunto, y así la cifra coincide con lo que ve al hacer click.
