
# Implementación — Homie Inspection UI Plan

Cubre las 18 mejoras del documento subido, organizadas en 3 fases ejecutables. Cada fase es un PR independiente y verificable.

## Cambio transversal previo

**Status labels canónicos** (`src/shared/ui/status-registry.ts`)
- `submitted` → "Lista para revisión" (hoy: "Enviada")
- `sent` → "Entregada" (hoy: "Enviada")
- `assigned` → "Asignada" (donde aún diga "Por coordinar")

Único cambio en el registry; se propaga automáticamente a todos los `StatusBadge`. Auditar `rg "Enviada|Por coordinar"` para limpiar strings hardcodeados (filtro del Select en `ExecutiveReviewQueue.tsx` línea 178).

---

## Fase 1 — Prioridad 1 (data integrity & flujos rotos)

### F1.1 · Bandeja: agrupación por job-to-be-done (B3)
Reemplazar `getExecutiveBucket` / `grouped` / `BucketSection` en `ExecutiveReviewQueue.tsx` por 4 grupos:
1. **Requieren tu acción** — `submitted`, `in_review`, `approved` · siempre visible · sort: más antiguos primero (tiempo en estado actual).
2. **En corrección** — `needs_changes` · sort por `fecha_de_termino_real_de_contrato` asc · subtítulo "Esperando que el inspector realice las correcciones solicitadas."
3. **Seguimiento** — `published`, `sent` · colapsado si >3 · sort por `published_at` desc.
4. **Pre-inspección** (colapsado) — `pending_assignment`, `assigned`, `in_progress`.

### F1.2 · Bandeja: CTAs por estado (B5)
Reescribir `getContextualCTA` con tabla por status (Iniciar revisión / Continuar revisión / Ver correcciones / Publicar / Abrir reporte / Asignarme / Ver detalle). "Asignarme" como acción inline cuando `pending_assignment`.

### F1.3 · Detail: gate de publicar correcto (D6)
En `ExecutiveReviewDetail.tsx`:
- Mostrar CTA "Publicar informe" SOLO si `inspection.status === 'approved'`.
- Mostrar "Republicar" SOLO si `status === 'published'`.
- Modal checklist pre-publicación: secciones revisadas, presupuesto generado, observaciones públicas faltantes. Reutilizar el `AlertDialog` introducido en la sesión anterior, enriqueciéndolo con los 3 checks. CTA primario: "Publicar de todas formas".

### F1.4 · Detail: autosave de observaciones (D7)
- Eliminar botones "Guardar" / "Guardar nota" del bloque de observación final y comentario interno.
- Hookear con `useDebouncedAutosave` (300ms, ya existe en `src/shared/hooks`).
- Indicador inline bottom-right por campo: `idle | saving | saved | error` usando `<AutosaveStatus />` ya existente.

### F1.5 · Detail: diferenciación pública vs interna (D8)
- Observación final (`final_observation`): borde izquierdo 3px primary, ícono Globe, label "Observación Final · Visible para propietario/inquilino", tooltip.
- Comentario interno: `bg-muted/40`, ícono Lock, label "Comentario Interno · Solo visible para el equipo", tooltip.

---

## Fase 2 — Prioridad 2 (alto impacto operativo)

### F2.1 · Bandeja: KPIs por estado real (B1)
Reemplazar los 4 KpiCard por 5: Para revisar (`submitted`), En revisión (`in_review`), En corrección (`needs_changes`), Para publicar (`approved`), Publicadas (`published` + `sent`). Cada card es clickeable y aplica filtro `statusFilter` correspondiente.

### F2.2 · Bandeja: estructura estándar de fila (B4)
- Address sin truncar (quitar truncate del span de dirección).
- Prefijar nombres con rol ("Inspector: ...", "Propietario: ...").
- Fecha contextual + tiempo-en-estado según tabla (helpers en nuevo `src/lib/executive-row-meta.ts`).
- Coloración amber/red según umbrales (>3d, >5d, etc.) usando `text-status-*`.
- Barra de progreso para `in_progress | submitted | in_review | needs_changes | approved`.

### F2.3 · Detail: badge dinámico de header (D1)
Sustituir badge hardcodeado por `<StatusBadge status={inspection.status} />` (ya cubierto por el registry).

### F2.4 · Detail: sidebar completa con 5 estados (D3)
- Reemplazar badges del sidebar de secciones por `<StatusBadge kind="section" status={s.status} />`, asegurando que cubre `needs_changes` con ícono ⚠.
- Counter arriba del listado: "X de Y secciones revisadas" + `<Progress>` (reviewed+completed / total visible).
- Quitar truncate de nombres; permitir wrap a 2 líneas.

### F2.5 · Detail: flujo "Aprobar inspección" (D5)
- Nueva CTA en header, visible solo cuando `status === 'in_review'`.
- AlertDialog: estado verde si todas reviewed; estado warning si faltan, listando nombres, con opciones "Revisar pendientes" / "Aprobar igual".
- Al aprobar: update `status='approved'`, `approved_at=now()`, `approved_by=auth.user.id`. Reusa los servicios existentes en `inspection-service.ts`; agregar `approveInspection(id)` si falta.

### F2.6 · Detail: repair side sheet (D9)
- Reemplazar el `Dialog` actual de agregar reparación por `<Sheet side="right">` con `w-[40vw] min-w-[420px]`.
- Sin overlay oscuro (`<SheetOverlay className="bg-transparent" />`).
- Conservar lógica (search catálogo, payer, cantidad, precio).
- Confirm dialog de descarte si hay cambios sin agregar.

### F2.7 · Detail: payer selector visual (D11)
- Segmented control grande (`h-10`) con 2 botones Inquilino/Propietario.
- Inquilino seleccionado = bg navy `bg-primary text-primary-foreground`; Propietario = bg green `bg-status-good text-status-good-fg` (o equivalente del DS).
- Default Inquilino con badge "(por defecto)" en primera apertura del item.
- Header totales reactivos: ya derivan de `budgetBreakdown`, sólo verificar que recalcula al cambiar `payer_role`.

---

## Fase 3 — Prioridad 3 (eficiencia)

### F3.1 · Bandeja: label del filtro suelto (B6)
El tercer filtro corresponde a Inspector — sólo agregar placeholder visible "Inspector ▼" (ya tiene `SelectValue placeholder`, validar que se muestre cuando `inspectorFilter === 'all'`). Para `marketFilter`, asegurar label "Mercado".

### F3.2 · Detail: banner submitted → in_review (D2)
- Banner top sticky cuando `status === 'submitted'`.
- Botones "Solo visualizar" (no muta) / "Comenzar revisión" (update `status='in_review'`, `review_started_at=now()`).
- Desaparece al transicionar.

### F3.3 · Detail: flujo "Solicitar cambios" (D4)
- Nueva CTA en header cuando `status === 'in_review'`.
- Sidebar enters selection mode: checkbox por sección `completed`.
- Textarea inline por sección seleccionada (placeholder definido).
- Footer sticky con conteo + confirm.
- On confirm: update `inspection.status='needs_changes'`, `inspection_sections.status='needs_changes'` para las seleccionadas, insert comentarios en `inspection_reviews` (`comment_type='revision_request'`).
- Banner read-only post-confirmación.

### F3.4 · Detail: lightbox de fotos (D10)
- Thumbs 120×120 grid 2-col.
- Lightbox full-screen con navegación ←/→, contador, eliminar con confirmación, cerrar Esc/✕.
- CTA "+ Agregar foto" visible en header del panel.
- Badge "Fotos · N" en header del panel.

### F3.5 · Detail: tooltip subtotales por sección (D12)
- En headers totales (Propietario / Inquilino / Total General), `Tooltip` con breakdown por sección a partir de `budgetBreakdown.bySection`.
- Resaltar sección activa (bold/underline).

---

## Migración de DB

No se requieren migraciones nuevas. Todos los estados ya existen en el enum. Validar que `inspection_reviews` permita `INSERT` para executive (revisar RLS antes de F3.3).

## Archivos principales

- `src/shared/ui/status-registry.ts` — labels canónicos
- `src/pages/executive/ExecutiveReviewQueue.tsx` — F1.1, F1.2, F2.1, F2.2, F3.1
- `src/pages/executive/ExecutiveReviewDetail.tsx` — F1.3, F1.4, F1.5, F2.3-F2.7, F3.2-F3.5
- `src/modules/review/api/useExecutiveQueue.ts` — exponer counts/groupers si conviene
- `src/lib/executive-row-meta.ts` *(nuevo)* — helpers de fecha contextual + alert thresholds
- `src/lib/inspection-service.ts` — agregar `approveInspection`, `requestChanges`, `startReview`

## Riesgos

- F2.6 (Sheet de reparación): hoy el dialog comparte estado con la lista; verificar no romper edición de items existentes.
- F1.4 (autosave): asegurarse de no perder cambios entre debounce y unmount al navegar entre secciones.
- F3.3: transición a `needs_changes` debe respetar `inspection-status-guard.ts`.

## Fuera de alcance

- Refactor estructural de `ExecutiveReviewDetail.tsx` (1856 líneas).
- Cambios en `OwnerReport.tsx` o `QuotationDialog.tsx`.
- Emails/notificaciones — sólo strings de UI.

---

¿Confirmás que arranque por **Fase 1** completa, o preferís reordenar prioridades (por ejemplo, llevar F2.6 side sheet antes que F1.4 autosave)?
