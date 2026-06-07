# Reporte público (URL): agrupar presupuesto por sección

Aplicar al reporte compartido por URL (`src/pages/public/OwnerReport.tsx`, vistas `owner` y `tenant`) el mismo criterio que ya usa `QuotationDialog`: **una tabla por sección del inmueble**, con un **badge `Obligatoria`/`Opcional`** por reparación. Sin cambios en cálculos, decisiones, descuentos, IVA, ni en el payload del RPC.

## 1. Helper de agrupación
Reemplazar `bucketRepairs` por `groupRepairsBySectionAndPayer(sections)` que devuelve:

```ts
{
  owner:  Array<{ sectionId, sectionTitle, items: PayloadRepair[], subtotal }>,
  tenant: Array<{ sectionId, sectionTitle, items: PayloadRepair[], subtotal }>,
}
```

- Recorre `report.sections` en su orden actual (ya viene ordenado del RPC).
- Para cada sección, separa repairs por `payer_role` (default `owner`).
- Mantiene la sección sólo si tiene items en ese payer.
- Conserva `payment_nature` en cada item (no se filtra ni se separa).

## 2. Nuevo componente `SectionRepairGroup`
Sustituye a las dos llamadas `RepairGroup` (Obligatorias / Opcionales) por una sola por sección.

- Header: título de la sección en el estilo actual de "OBLIGATORIAS" (uppercase, tracking-wide), con el subtotal de la sección a la derecha (usa `projectedSum` cuando `interactive`, igual que hoy).
- Lista de `RepairRow` ya existente.
- En `RepairRow`: añadir un `<Badge>` debajo de `r.name` con:
  - `Obligatoria` → `variant="secondary"`
  - `Opcional` → `variant="outline"`
  Usa el componente `Badge` de `@/components/ui/badge` (mismo patrón que `QuotationDialog`). Nada de colores hardcoded.

## 3. Render en el tab Presupuesto
En `TabsContent value="budget"`:

- **Audiencia `owner`**: la card "Reparaciones a cargo del propietario" lista `groups.owner` como `SectionRepairGroup` por sección; la card "Reparaciones a cargo del inquilino" lista `groups.tenant`. Si un payer no tiene secciones, se mantiene el mensaje "Sin reparaciones asignadas."
- **Audiencia `tenant`**: la única card lista `groups.tenant` por sección.
- Subtotales por payer, descuentos, IVA, "Total proyectado", banner del total combinado y `projectedSum`/`grandRejected` se mantienen exactamente como hoy (siguen sumando sobre los mismos arrays planos `owner.required+optional`, `tenant.required+optional`, recalculados desde los groups).

## 4. Lo que NO cambia
- `get_published_report` (RPC) y el shape del payload.
- Lógica de decisiones owner-side (`accepted/observed/rejected`), comments, `submit`, locked state, badges de decisión.
- Cálculos de IVA, descuento prorrateado, totales por payer y "Total proyectado".
- Tab "Reporte" (observaciones por sección con fotos) y el resto del archivo.
- Diseño tokens (sin colores hardcoded; reuso de `Badge`, `Card`, tokens `primary`, `muted-foreground`, etc.).

## Archivos
- `src/pages/public/OwnerReport.tsx` — única edición.
