
# Refactor Homie Inspection — alineado a Homie Admin Portal (DS canónico)

Fuente de verdad: proyecto **Homie Admin Portal** (`/projects/40f1de73-...`) + `homie-booking-spec.md`.
Objetivo: que Inspection adopte tokens, layout, patrones y arquitectura del Admin Portal, sin romper producción y sin reescritura.

---

## Parte 1 — Diagnóstico

### Estado actual de Inspection (medido)
- **5 god components** = ~46% del frontend: `ExecutiveReviewDetail` (1681 ln, 39 hooks, 27 queries Supabase inline), `AdminInspectionDetail` (1641 ln, 40 queries), `AdminRepairCatalog` (919), `AdminUsers` (909), `InspectorSectionComplete` (850).
- **0 usos de `useQuery`/`useMutation`** aunque `QueryClientProvider` está montado → todo es `useEffect + setState + supabase.from()`.
- **Sin capa de servicios**: pantallas hablan directo con `supabase.from()`.
- **Lógica de status duplicada en 14+ archivos** (labels/colores/transiciones).
- **Sin módulos por dominio**: `src/components/` mezcla quotation, signature, photo, tax, layouts, badges.
- **Drift conocido**: `inspection-generator.ts` vive en `src/lib/` y en `supabase/functions/_shared/`, sincronizado a mano vía test de paridad.
- Solo 2 hooks reusables (`use-mobile`, `use-toast`).

### Brechas vs Admin Portal (DS canónico)
| Aspecto | Admin Portal | Inspection hoy |
|---|---|---|
| Background | `#F4F7FE` (224 60% 97%) | `#F6F7FB` |
| Border | `#DBD1CA` warm | gris frío `#E5E7EB` |
| Soft variants | `homie-soft-blue/green`, `neutral-warm` tokenizados | hex inline en componentes |
| Radius base | `--radius: 0.75rem` (12), pills `rounded-full`, cards `rounded-xl` | mezcla `xs..xl` ad-hoc |
| Typography | Inter hoy / Cabinet+Fraunces+DM Mono (spec target) | Inter, sin `font-display` |
| Patrones | `PageHeader`, `FiltersBar`, `KpiCard`, `StatusBadge`, `OperationalStateBadge`, `HotTag`, `DataTable`, `DetailSheet`, `EmptyState`, `AlertCallout` | ninguno como componente reusable |
| Shell | `AppLayout` con sidebar + `RoleProvider` + `RoleGuard` + `RoleSwitcher` | `AdminLayout`/`ExecutiveLayout` paralelos + bottom-nav inspector |
| Estado de carga | `skeleton` consistente | mezcla de "Loading..." y nada |
| Sheets | regla "nunca apilar", widths estandarizados | dialogs inline ad-hoc |
| Module router | rutas agrupadas por dominio | rutas planas en `App.tsx` |

### Riesgos
- **Técnico**: cada `setState` re-renderea árboles de 1k+ líneas; sin cache, sin invalidación coherente.
- **UX**: badges/CTAs reescritos en cada pantalla → semántica drift entre roles.
- **Producto**: cuando Inspection se integre como módulo del Admin Portal global, el desajuste visual sería brusco.

### Inconsistencias documentación ↔ código (explícitas)
1. Memoria `inspector-mobile-patterns` define `StickyActionBar` — no existe como componente.
2. ADR-001: `inspection_photos.public_url` deprecated — aún se escribe.
3. `QueryClientProvider` montado pero inerte (0 usos).
4. Memoria `executive-desktop-patterns` (sticky summary, side-by-side) — implementada parcialmente y a mano.
5. Memoria `workflow-staged-model` (4 stages) — gating UI inconsistente entre pantallas.

---

## Parte 2 — Arquitectura propuesta (espejo del Admin Portal)

```text
src/
  app/
    router.tsx                      # rutas declarativas, agrupadas por dominio
    providers.tsx                   # Query + Auth + Role + Tooltip + Toaster
  modules/                          # un módulo = un dominio
    inspection/                     # inspector workflow + form dinámico
      api/  components/  hooks/  pages/  state/  types.ts
    review/                         # ejecutivo: queue + review detail
    repairs/                        # catálogo + repair items + contractor pricing
    quotation/                      # totales + IVA + variantes owner/tenant
    report/                         # public report + versions
    admin/                          # users, settings, integrations
    inspector/                      # dashboard, agenda, perfil
  shared/
    auth/                           # AuthContext, ProtectedRoute, useRole
    permissions/                    # can(role, action, resource) + RoleGuard
    layouts/                        # AppShell (espejo de AppLayout AP) + InspectorMobileShell
    ui/                             # design-system primitives (Parte 4)
    hooks/  lib/
  integrations/supabase/            # autogenerado
  generated/                        # destino futuro del inspection-generator compartido
```

### Reglas duras
- Una pantalla **no** importa `supabase/client`. Solo `modules/*/api/*`.
- Cada módulo expone vía barrel `modules/<x>/index.ts`.
- `shared/` nunca importa de `modules/`.
- Permisos = módulo (`shared/permissions/policies.ts`), nunca `if (role === ...)` inline.
- Tokens semánticos en `index.css`; **prohibido** `style={{ color: "#..." }}` en componentes.

### Alineación con Admin Portal
- Adoptar `AppShell` con la misma estructura: `SidebarProvider` + sidebar colapsable + header con `SidebarTrigger`. Inspector mantiene su shell mobile (bottom-nav), pero ambos consumen los mismos tokens y componentes base.
- `RoleProvider` + `RoleGuard` replicados (en Inspection viene del `AuthContext`; envolver para misma API).
- Rutas agrupadas en `src/app/router.tsx` con el mismo estilo del Admin Portal.

---

## Parte 3 — Refactor de componentes

### Dividir (alta prioridad)

| Componente | Hoy | Propuesta | Riesgo |
|---|---|---|---|
| `ExecutiveReviewDetail` | 1681 ln, 27 queries | `<ReviewStickySummary>` + `<Tabs>` con `<ObservationsTab>`, `<RepairsTab>`, `<QuotationTab>`, `<PublishTab>`; data via `useReviewBundle(id)` (RPC o `useQueries`) | Medio |
| `AdminInspectionDetail` | 1641 ln, 40 queries | `<InspectionHeader>` + `<InspectionOverrideForm>` + `<AuditLogPanel>` + reusa `<RepairsTab>`/`<QuotationTab>` | Medio |
| `InspectorSectionComplete` | 850 ln | `<DynamicField>`, `useFieldAutosave`, `<PhotoEvidenceGate>`, `useSectionCompletion()` | Bajo-Medio |
| `AdminRepairCatalog` | 919 ln | `<CatalogItemTable>` + `<ContractorPricingMatrix>` en `modules/repairs/admin/` | Bajo |
| `AdminUsers` | 909 ln | `<UserApprovalQueue>` + `<UserRoleAssignDialog>` + `useUserManagement()` | Bajo |
| `InspectorInspectionDetail` | 721 ln | `<SectionListItem>` + `<InspectionMetaCard>` + `<InspectionActionBar>` | Bajo |

### Unificar
- `StatusBadge` + `InspectorStatusBadge` → un solo `<StatusBadge>` alimentado por **`StatusRegistry`** (label/color/icon/canTransitionTo por status), espejo del `StatusBadge` del Admin Portal (`Pendiente/Confirmada/Concretada/Cancelada/No Show` → traducido al dominio Inspection).
- `AdminLayout`/`ExecutiveLayout` → `<AppShell role>` con slots (igual al AP).
- IVA/cotización disperso → módulo `modules/quotation` con `computeQuote({ items, tax, audience })` puro.

### Eliminar
- `src/components/ui/use-toast.ts` (re-export trivial).
- Escritura de `inspection_photos.public_url` (ADR-001).
- Copia local de `inspection-generator.ts` (mover a `generated/`).

### Hooks reusables a crear
`useInspection(id)`, `useInspectionSections(id)`, `useSection(id)`, `useRepairItems(inspectionId)`, `useSectionCompletion(section)`, `usePublishReport(id, audience)`, `usePermissions()`, `useAutosave(value, save, delay)`, `usePhotoUpload(inspectionId, sectionKey)`, `useReviewBundle(id)`, `useExecutiveQueue(filters)`.

### Providers
`PermissionsProvider`, `MarketProvider` (resuelve tax + currency + WhatsApp), `RealtimeProvider` (selectivo para inspección abierta).

---

## Parte 4 — Design System (adoptar AP verbatim)

### Tokens (mover `src/index.css` a los valores del Admin Portal)
```css
:root {
  --primary: 231 32% 48%;            /* #525EA2 */
  --accent:  168 60% 34%;            /* #238D7E */
  --background: 224 60% 97%;         /* #F4F7FE */
  --foreground: 240 38% 12%;
  --card: 0 0% 100%;
  --secondary: 231 26% 89%;          /* #DCDEEB */
  --muted: 230 25% 95%;
  --destructive: 0 72% 84%;          /* #F6B9B8 */
  --border: 25 18% 86%;              /* #DBD1CA warm */
  --ring: 231 32% 48%;
  --radius: 0.75rem;
  /* Homie extended */
  --homie-green-hover: 168 55% 29%;
  --homie-orange: 24 82% 57%;
  --homie-yellow: 34 89% 62%;
  --homie-pink:   1 72% 84%;
  --homie-taupe:  0 18% 42%;
  --homie-soft-green: 162 24% 88%;
  --homie-soft-blue:  231 26% 89%;
  --homie-neutral-warm: 30 20% 92%;
  /* Status semantics (NUEVO en Inspection) */
  --status-pending:      var(--homie-soft-blue);
  --status-in-progress:  var(--homie-yellow);
  --status-needs-changes:var(--homie-orange);
  --status-approved:     var(--accent);
  --status-published:    var(--primary);
  --status-blocked:      var(--destructive);
}
```

### Typography
- Mantener Inter hoy; declarar `font-display` (Fraunces) y `font-mono` (DM Mono) ya como tokens vacíos para migrar luego sin tocar componentes.
- Escala: `display 24 / h2 20 / h3 18 / base 14 / small 12 / micro 10–11`, `tracking-wider` en micro labels.

### Radius
Pills `rounded-full`, inputs/buttons `rounded-lg`, cards/tables `rounded-xl`, surfaces `rounded-2xl`.

### Componentes base (espejo AP + extras Inspection)
- **Espejos directos**: `<PageHeader title description breadcrumb actions>`, `<FiltersBar sticky>`, `<KpiCard label value trend accent inverted>`, `<StatusBadge>`, `<DataTable>` (composed sobre `Table`), `<DetailSheet>` (nunca apilar), `<EmptyState>`, `<AlertCallout variant>`.
- **Extras Inspection**: `<SectionCard>`, `<PhotoGrid>`, `<PhotoLightbox>`, `<SignaturePad>` (ya existe, mover a `shared/ui`), `<MoneyDisplay amount currency>`, `<TaxBreakdown subtotal vat total label>`, `<StickyActionBar>` (mobile + desktop), `<LoadingState>` (Skeleton AP-style), `<ErrorState onRetry>`, `<ConfirmDialog>`.

### Reglas semánticas (documentar en `shared/ui/README.md`)
- color → significado fijo: orange = warning accionable, red = blocked, blue = informational, green = success/approved, neutral = pending/draft.
- variantes: `solid` = estado del sistema; `soft` = atributo del item; `outline` = filtro activo.
- 1 CTA primario por pantalla.
- DetailSheet: **nunca apilar** (espejo AP rule).

---

## Parte 5 — Refactor operacional

### Executive Queue
`<PageHeader>` + `<FiltersBar sticky>` + tabs `Lista | Calendario` + `<DataTable>`. Concepto nuevo **"Bandeja accionable"** (solo `submitted | needs_changes | in_review` asignados al user) vs "Seguimiento" (resto). KPIs arriba con `<KpiCard>` (citas en revisión, vencidas, sin asignar).

### Executive Review Detail
```
<ReviewLayout>
  <ReviewStickySummary />     // estado + dueño + due + 1 CTA primario
  <Tabs>
    <ObservationsTab />       // inspector vs ejecutivo side-by-side
    <RepairsTab />            // crear/editar/asignar contractor
    <QuotationTab />          // owner vs tenant + IVA
    <PublishTab />            // genera link, versiones históricas
  </Tabs>
</ReviewLayout>
```
Gating: tab N se deshabilita si la stage N-1 no está completa (refleja `current_stage`).

### Repairs (`modules/repairs`)
- `<RepairItemEditor>` reusable (ejecutivo + admin override).
- `useRepairPricing({ item, contractor, market })` resuelve `unit_price`, `contractor_unit_price`, currency, tax-aware.
- Ownership claro: ejecutivo crea/edita; admin sólo audita y mantiene catálogo.

### Contractor
`<ContractorAssignmentField>` consume `usePermissions().can('assign', 'contractor')`. Enable/disable consistente con RLS.

### Quotation
`computeQuote(items, taxConfig, audience)` puro y testable. Render via `<QuotationPreview>` reusado en review detail y en public report.

### Public Report
Romper `OwnerReport` en `<ReportHero>`, `<ReportSection>`, `<ReportQuotation>`, `<ReportSignature>`, `<ReportFooter>`. Cache de signed URLs por `storage_path` (TTL 50 min).

### Settings (admin)
`<SettingsShell>` con subpáginas: `/admin/settings/markets`, `/tax`, `/communication`, `/integrations`. Espejo del `ConfiguracionIndex` del AP.

### Permisos
```ts
// shared/permissions/policies.ts
export const can = (role, action, ctx?) => boolean;
// can('executive', 'publish_report', { inspection })
```

---

## Parte 6 — Performance & maintainability

- Activar react-query (cache + invalidate + optimistic). Habilita "marcar reparación", "aprobar sección", "agregar observación" instantáneos.
- Combinar las 27 queries del review detail en `useReviewBundle(id)` (RPC `get_review_bundle` o `useQueries` paralelas).
- Virtualizar `<SectionListItem>` en inspecciones con >40 secciones (TanStack Virtual).
- Realtime selectivo: `inspection_sections` + `inspection_field_values` de la inspección abierta.
- Paginación cursor en queues y listas admin (hoy asume <1000 filas → query limit silencioso).
- Memoizar derivaciones de `useSectionCompletion`, `useRepairPricing`.

---

## Parte 7 — Roadmap

### Fase 0 — DS alignment (1 semana, riesgo BAJO, visual sí)
**Objetivo**: tokens y componentes base alineados al Admin Portal. UI cambia de forma controlada.
- Reemplazar `src/index.css` con tokens del AP (parte 4).
- Crear `src/shared/ui/`: `PageHeader`, `FiltersBar`, `KpiCard`, `StatusBadge` (vía `StatusRegistry`), `DataTable`, `DetailSheet`, `EmptyState`, `AlertCallout`, `LoadingState`, `ErrorState`, `StickyActionBar`, `ConfirmDialog`.
- Migrar layouts: `<AppShell>` con sidebar AP en desktop; mantener bottom-nav inspector.
- Reemplazar badges/cards/empty ad-hoc en 3 pantallas piloto (`ExecutiveReviewQueue`, `AdminInspections`, `InspectorDashboard`).

Archivos afectados: `src/index.css`, `tailwind.config.ts`, nuevos `src/shared/ui/**`, edits a 3 pantallas.
Esfuerzo: ~30h. Impacto: consistencia visual inmediata + base para todo lo demás.

### Fase 1 — Quick wins técnicos (1-2 semanas, BAJO)
**Objetivo**: cero cambios visuales, base técnica.
- Activar react-query: `useInspection`, `useInspectionSections`, `useRepairItems`, `useReviewBundle`, `useExecutiveQueue`.
- Crear `src/modules/*/api/*.service.ts` y mover `supabase.from()` fuera de las pantallas.
- `StatusRegistry` único + reemplazar 14 condicionales duplicados.
- `<ConfirmDialog>` reemplaza `confirm()` inline.

Esfuerzo: ~40h. Impacto: elimina ~600 líneas, habilita cache, prepara división.

### Fase 2 — Structural refactor (3-4 semanas, MEDIO)
**Objetivo**: dividir god components, introducir módulos.
- Crear `src/modules/{inspection,review,repairs,quotation,report,admin,inspector}`.
- Mover pantallas (1 PR por módulo).
- Dividir `ExecutiveReviewDetail` → sticky summary + 4 tabs.
- Dividir `AdminInspectionDetail` → header + override + audit + reuso de tabs.
- Introducir `shared/permissions` + `RoleGuard` (estilo AP).
- Mitigación: feature-flag por módulo + tests Playwright del happy-path.

Esfuerzo: ~120h. Impacto: mantenibilidad alta, onboarding < 1 día por módulo.

### Fase 3 — Repairs/Quotation/Public Report (2 semanas, MEDIO)
- `<RepairItemEditor>`, `useRepairPricing`, `<QuotationPreview>` reusable.
- `<ContractorAssignmentField>` con permisos.
- Romper `OwnerReport` en piezas data-driven (futuro PDF export).
- Cache signed URLs.

Esfuerzo: ~60h.

### Fase 4 — Scalability multi-market (2 semanas, MEDIO)
- `MarketProvider` (tax + currency + idioma + WhatsApp).
- Consolidar `inspection-generator` en paquete compartido (drift gone).
- Paginación cursor en queues/listas.
- Realtime selectivo.
- `<MoneyDisplay>` + helpers por mercado.

### Fase 5 — Convergencia con Admin Portal global + AI-ready (2 semanas, BAJO)
- Empaquetar Inspection como módulo montable bajo el `AppLayout` del Admin Portal (rutas `/inspecciones/*` ya existen como stubs allí).
- Capa `modules/ai/` con `useAISuggestion({ kind, context })` sobre Lovable AI Gateway.
- `<AISuggestionPill>`, `<AISuggestionPanel>` siempre con aceptar/descartar (asistivo, no autónomo).
- Auditoría: `inspection_audit_log` con `source = 'ai_suggestion'`.
- Hooks: `suggestObservation(photo)`, `suggestRepair(section)`, `summarizeReview(inspection)`.

---

## Restricciones respetadas
- No reescritura: cada fase es independiente y desplegable.
- No microservicios: frontend + Supabase.
- No breaking changes: URLs y RLS intactos.
- Modelos de negocio sin cambios; sólo se reorganiza presentación + arquitectura.
- DS canónico = Admin Portal verbatim (tokens, patrones, reglas), Inspector mobile conserva sus afordancias.

## Próximo paso sugerido
Aprobar **Fase 0 + Fase 1** como primer bloque (DS alignment + quick wins técnicos). Es ~70h, impacto visual controlado y desbloquea todo lo demás. Al aprobar, comienzo por:
1. Tokens del AP en `index.css` + `tailwind.config.ts`.
2. `shared/ui/{PageHeader, FiltersBar, StatusBadge, DataTable, DetailSheet, EmptyState, AlertCallout, KpiCard}`.
3. Migrar `ExecutiveReviewQueue` como piloto (el más simple de los grandes).
4. `useInspection` + `useReviewBundle` + servicios.
