
# Refactor — `ExecutiveReviewDetail.tsx`

**Estado actual:** 2015 líneas, un único componente con 20+ piezas de estado, ~10 acciones async (fetch + mutaciones de inspections / sections / repairs / reviews / signatures / report_versions) y un JSX de ~780 líneas que mezcla header, sidebar, workspace, panel de fotos, drawer de reparaciones, 4 dialogs y banners contextuales.

**Objetivo:** Llevar el archivo principal a ~400 líneas (orquestación + render top-level), sin cambiar comportamiento, dejando los seams listos para futuras iteraciones.

**Principios:**
- Sin cambios de UX ni de queries. Sólo movimiento de código y extracción de hooks/sub-componentes.
- Cada fase compila y queda funcional por sí sola (PR independiente).
- TypeScript estricto: cada extracción declara su `Props` propio.
- Convención de carpetas: `src/modules/review/` para hooks/servicios; `src/pages/executive/review-detail/` para sub-componentes que sólo viven aquí.

---

## Fase R1 — Capa de datos + mutaciones (riesgo: bajo)

Extraer todo el `fetchAll` + setters relacionados a un hook + servicio.

**Nuevo:** `src/modules/review/api/useReviewDetail.ts`
- Encapsula los 7 `useState` de data (`inspection`, `sections`, `fieldsBySection`, `photosBySection`, `reviewsBySection`, `repairsBySection`, `signatureRecord`) + `loading`.
- Expone `{ data, loading, refetch, setPhotosBySection, setRepairsBySection }` (los dos setters quedan expuestos sólo para optimistic updates locales — temporal hasta R2).
- Reusa `useInspection` / `useSectionsBulk` donde tenga sentido o queda standalone si la queryKey no encaja.

**Nuevo:** `src/modules/review/api/repairs.service.ts`
- `addRepairFromCatalog`, `updateRepairItem`, `deleteRepairItem`, `rebindContractorPrices` — funciones puras async que reciben supabase, ids y devuelven `void | error`. Componente queda con `await service.x(...); await refetch();`.

**Nuevo:** `src/modules/review/api/inspection-actions.service.ts`
- `startReview(id)`, `approveInspection(id, profileId)`, `requestChanges({ id, profileId, sections, comments })`, `publishInspection({ ... })`.

**Resultado esperado:** -350/-400 líneas en el archivo, sin cambios visibles.

---

## Fase R2 — Sub-componentes de dialogs/sheets (riesgo: bajo)

Extraer los modales que hoy viven inline:

| Componente | Ubicación nueva | Notas |
|---|---|---|
| `<PublishDialog>` | `review-detail/PublishDialog.tsx` | wrap del AlertDialog de pre-publish checklist + missing observations |
| `<ApproveDialog>` | `review-detail/ApproveDialog.tsx` | dialog F2.5 con estado verde/warning |
| `<RequestChangesPanel>` | `review-detail/RequestChangesPanel.tsx` | selección + textareas + footer sticky |
| `<RepairCatalogSheet>` | `review-detail/RepairCatalogSheet.tsx` | Sheet con búsqueda + grid |
| `<PublishedUrlsDialog>` | `review-detail/PublishedUrlsDialog.tsx` | tras publicar, dialog con owner/tenant URLs y copy |

Cada uno recibe sólo `open`, `onOpenChange`, y las callbacks que necesita. El componente principal pasa de coordinar 5 abres/cierres a montar 5 children.

**Resultado esperado:** -300 líneas.

---

## Fase R3 — Render principal en bloques (riesgo: medio)

El bloque `return (…)` (635 → 1410) se parte en:

```text
src/pages/executive/review-detail/
  ReviewHeaderBar.tsx        // breadcrumb, status badge, CTAs por estado + banner submitted→in_review
  BudgetSummaryBar.tsx       // totales owner/tenant/total + tooltips + depósito vs ownerRequired
  SectionSidebar.tsx         // lista de secciones + contador + Progress + ToggleGroup
  ContractorPicker.tsx       // select de contratista + warning de precios
  InspectorProgressCard.tsx  // estado del inspector + last_active
```

`SectionWorkspace` y `PhotoPanel` ya están extraídos al fondo del archivo — se mueven a archivos propios (`review-detail/SectionWorkspace.tsx`, `review-detail/PhotoPanel.tsx`). `SectionRepairsDrawer` también.

Cada componente recibe sólo lo que necesita; nada de "pasar el state completo".

**Resultado esperado:** archivo principal queda en ~400 líneas: imports + state mínimo (UI state, no data) + composición JSX.

---

## Fase R4 — Limpieza (riesgo: bajo)

- Mover `SectionTotalsBreakdown` y los helpers `fmt` / `fmtCurrency` / `statusLabel` a `review-detail/helpers.ts`.
- Promover `groupBy` a `src/lib/utils.ts` (ya se usa en varias páginas).
- Eliminar `saveInternalNote` / `saveFinalObservation` legacy (sin callers después de R1).
- Eliminar `existingReportUrl` (siempre `null`).
- Reemplazar `any` casts más obvios donde el tipo correcto está disponible.

---

## Estructura final propuesta

```text
src/
  modules/review/api/
    useReviewDetail.ts            (nuevo, R1)
    repairs.service.ts            (nuevo, R1)
    inspection-actions.service.ts (nuevo, R1)
    useExecutiveQueue.ts          (ya existe)
  pages/executive/
    ExecutiveReviewDetail.tsx     (~400 líneas, orquestación)
    review-detail/                (todo nuevo)
      ReviewHeaderBar.tsx
      BudgetSummaryBar.tsx
      SectionSidebar.tsx
      ContractorPicker.tsx
      InspectorProgressCard.tsx
      SectionWorkspace.tsx        (mover desde fondo)
      PhotoPanel.tsx              (mover desde fondo)
      SectionRepairsDrawer.tsx    (mover desde fondo)
      PublishDialog.tsx
      ApproveDialog.tsx
      RequestChangesPanel.tsx
      RepairCatalogSheet.tsx
      PublishedUrlsDialog.tsx
      helpers.ts
```

---

## Verificación por fase

- `bunx tsc --noEmit` después de cada extracción.
- Smoke manual de la página (`/executive/inspection/:id`) en cada PR: abrir, navegar entre secciones, agregar reparación, cambiar contratista, aprobar, solicitar cambios, publicar, abrir lightbox de fotos.

## Riesgos

- **Closures sobre estado en mutaciones de repair:** hoy `addRepairFromCatalog` lee `repairsBySection[catalogSectionId]` para calcular `sort_order`. Al moverlo a servicio hay que pasar `existingCount` como argumento, no leer del estado dentro del servicio.
- **`fetchAll` después de cada mutación:** R1 lo mantiene como hoy (refetch completo). Optimizar (refetch selectivo) queda fuera de alcance.
- **Tests:** no hay tests de este componente; el smoke manual es la red de seguridad.

## Fuera de alcance

- Refactor de `OwnerReport.tsx`, `QuotationDialog.tsx`, `AdminInspectionDetail.tsx`.
- Cambios en queries / payload de publicación.
- Migración a React Query para mutaciones (queda como follow-up).

¿Arranco con **Fase R1** (hook de datos + servicios de mutaciones)?
