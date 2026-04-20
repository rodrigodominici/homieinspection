

## Plan: correcciones visuales (sin tocar lógica)

Cambios estrictamente de Tailwind / markup presentacional. Cero cambios en queries, estados, contratos de datos o handlers.

---

### Pantalla 1A — `src/pages/admin/AdminIntegrationHubSpot.tsx` ("Mapeo de campos")

Hoy la sección no es un `<table>` sino un grid de 3 columnas (`grid-cols-[200px_80px_1fr]`). Lo convierto a `<table>` real para cumplir el requerimiento de `td/th`, `align-top`, padding y wrap.

- Reemplazar el bloque `FIELD_MAPPING.map(...)` por una tabla shadcn-style:
  - `<table className="w-full text-sm">` con `<thead>` (Campo / Requerido / Descripción) y `<tbody>`.
  - Cada `<th>` y `<td>`: `py-3 px-4 align-top text-left`.
  - Columna "Campo": `<code className="text-xs">` (sin truncate), `whitespace-nowrap` solo en esta celda.
  - Columna "Requerido": badge con `mr-2` respecto a cualquier texto adyacente; celda `w-[110px]`.
  - Columna "Descripción": `whitespace-normal break-words text-xs text-muted-foreground` (sin `truncate`, sin `whitespace-nowrap`). Esto deja que `inspector_email` / `executive_email` hagan wrap completo.
  - Filas con `border-b last:border-0`.

### Pantalla 1B — `src/pages/admin/AdminIntegrationHubSpotLogs.tsx` (tabla "Eventos entrantes")

- **Padding de filas**: cambiar `px-3 py-2` → `px-4 py-3` en todos los `<th>` y `<td>` para dar aire.
- **Alineación**: agregar `align-top` a todos los `<td>` (necesario porque la columna Error y Estado tienen contenido apilado).
- **Chip de estado + "Asignación parcial"** (líneas 245–254): reorganizar en `flex flex-col gap-1 items-start`. Primer hijo: el `<Badge>` de status. Segundo hijo (si `hasPartialAssignment`): `<span className="text-xs text-muted-foreground">Asignación parcial</span>` — ya no badge.
- **Columna Error** (líneas 265–275): envolver el bloque visible en un `<Tooltip>` shadcn:
  - Trigger: `<div className="max-w-[200px] truncate cursor-help">` con la `failure_reason` label + `error_message` truncados (mantener jerarquía actual: título en `font-medium`, mensaje en `text-[11px] opacity-90`, `processing_step` debajo en `text-muted-foreground`).
  - `TooltipContent`: `max-w-md whitespace-pre-wrap break-words text-xs` mostrando `failure_reason` + `error_message` + `processing_step` completos.
  - Reutilizar el `TooltipProvider` ya importado (envolver localmente o subir uno al root del `tbody` row — usaré uno por celda, igual que `RetryButton`).
- **Botón "Detalles"** (línea 277): cambiar `variant="ghost"` → `variant="link"`, agregar `className="text-sm px-0 h-auto"` para verse como link sin padding.
- **Celda Error**: quitar `max-w-[220px]` (lo controla el div interno con `max-w-[200px]`).

### Pantalla 2 — `src/pages/inspector/InspectorAllInspections.tsx` (lista mobile)

El contenedor ya usa `space-y-3` y `pb-24`. El solapamiento visual reportado viene de `active:scale-[0.99] transition-transform` aplicado a la `<Card>` dentro de un `<Link>` sin `block` — el Link es inline por defecto, lo que puede causar render raro al pulsar. Ajustes mínimos:

- En cada `<Link to=...>` (las 2 ramas: "Por coordinar" y card estándar) agregar `className="block"` para que el área tappable sea bloque y no inline.
- Mantener `space-y-3` en `<main>`. Verificar que `pb-24` del wrapper exterior es suficiente sobre el `InspectorBottomNav`; si el bottom nav midió ~80px, dejar `pb-24` (ya es ≥96px). Sin cambios adicionales.
- No tocar `active:scale-[0.99]` (es intencional como feedback táctil) — al volverse `block`, ya no hay overlap del transform sobre la card vecina.

### Archivos tocados

- `src/pages/admin/AdminIntegrationHubSpot.tsx` — refactor tabla "Mapeo de campos" a `<table>`.
- `src/pages/admin/AdminIntegrationHubSpotLogs.tsx` — padding, align-top, jerarquía estado/sub-label, tooltip en Error, botón link.
- `src/pages/inspector/InspectorAllInspections.tsx` — `className="block"` en los 2 `<Link>`.

Sin migraciones, sin cambios en tipos, sin cambios en handlers.

