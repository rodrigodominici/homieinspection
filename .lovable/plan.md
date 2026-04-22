

## Diagnóstico (paso 1)

**1. Dropdown "Todos los estados" tapa las cards**
La barra de filtros (`flex flex-wrap items-center gap-3`) está pegada al listado sin contenedor visual ni separación. Los `SelectContent` de Radix se portalan correctamente (z-index OK), pero al abrirse hacia abajo cubren la primera card porque no hay margen, ni borde/contenedor que delimite la barra. Buscador + chips + 4 selects en flujo libre acentúan el efecto.

**2. Badges duplicados en cada card**
Cada card renderiza tres fuentes de estado superpuestas (líneas 494–504 de `AdminInspections.tsx`):
- `bucketLabel(bucket)` → "Sin asignar"
- `missingAssignmentLabel(insp)` → "Faltan ambos / Falta inspector / Falta ejecutivo"
- `<InspectionStatusBadge status={insp.status}>` → para `pending_assignment` también imprime "Sin Asignar"

Resultado para sin asignar: `Sin asignar` + `Faltan ambos` + `Sin Asignar`. Dos vocabularios distintos (bucket operativo + enum de BD) producen la misma etiqueta.

**3. Workload está en la pantalla equivocada**
`AdminInspections.tsx` declara un tab `workload` hermano de "Todas / Pendientes / Crear". Eso lo hace leer como otra forma de listar inspecciones, cuando en realidad es soporte para decisiones de asignación, que es el rol del Dashboard. El Dashboard actual tiene contadores parciales por inspector/ejecutivo sin las métricas operativas correctas.

**4. Campos del snapshot disponibles pero NO renderizados en `Datos del inmueble`**
Hoy `PropertyBriefingCard.tsx` muestra: address, property_type, tower, market, fecha_recoleccion_llaves, hora_recoleccion_llaves, unit_number, tenant_name, tenant_whatsapp, fecha_de_termino_real_de_contrato, parking_number, storage_number.

Confirmado en BD que los snapshots reales también incluyen y NO se muestran:
- `bedrooms_count`
- `bathrooms_count`
- `has_storage` (boolean)
- `has_parking` (boolean)
- `recipient_email`
- `warranty_deposit`

---

## Plan de corrección (paso 2)

### A. Fuente única de prioridad operativa

Crear / extender `src/lib/inspector-operational.ts` exportando:

```ts
export type PriorityBucket = 0 | 1 | 2 | 3 | 5;
export function priorityBucket(insp): PriorityBucket
export function priorityBucketLabel(b): { label, className }
export function missingAssignmentLabel(insp): string | null
```

`AdminInspections.tsx` y `AdminDashboard.tsx` consumen estas funciones — los tiles del Dashboard, los chips bucket de la lista y el sort `priority` quedan garantizados en el mismo cálculo. No puede driftear.

### B. Mover Workload de Inspecciones → Admin Dashboard

`src/pages/admin/AdminInspections.tsx`:
- Eliminar `<TabsTrigger value="workload">` y `<TabsContent value="workload">` completos.
- Eliminar el `useMemo` `workload` y el componente local `Stat`.
- Tabs queda: `Todas / Pendientes / Crear`.

`src/pages/admin/AdminDashboard.tsx` — refactor:

**B.1 Top operational summary (4 tiles)**
`Sin asignar` · `Por coordinar` · `Programadas / por iniciar` · `En progreso`
Reemplaza los 5 KPI actuales. Calculados con `priorityBucket` compartido.

**B.2 High-priority queue: Sin asignar (top 5)**
Card "Asignación urgente" antes de "Próximas Programadas" — la urgencia de asignación supera a la fecha. Cada item linkea a `/admin/inspections/{id}` con badge "Falta inspector/ejecutivo/ambos".

**B.3 Workload Inspectores**
Por cada inspector activo (rol = inspector, is_active=true): nombre + email + market + métricas: `Activas` · `Por coordinar` · `Por iniciar` · `En progreso`. Ordenado por Activas desc.

**B.4 Workload Ejecutivos**
Simétrico: nombre + email + market + métricas: `Activas` · `Pend. revisión` · `En revisión` · `Listas publicar` · `Publicadas`. Ordenado por Activas desc.

Las dos cards de workload reemplazan "Pendientes por Inspector" / "Por Revisar por Ejecutivo". Se conservan "Próximas Programadas", "Sin Devolución de Llave", "Inspecciones Recientes".

### C. `AdminInspections.tsx` — overlap del dropdown + deduplicación de badges

**C.1 Barra de filtros (overlap)**
Envolver buscador + bucket chips + filtros avanzados en una `<Card>` con `p-4 space-y-3` y `mt-4` antes del listado. Estructura:

```
Card "Controles":
  ├── Search input (full width)
  ├── Bucket chips row (prioridad operativa)
  └── Separator + collapsible "Filtros avanzados":
       ├── Estado (select, conservado)
       ├── Inspector (select)
       ├── Ejecutivo (select)
       └── Ordenar por (select)
```

`Estado` se **conserva** dentro de un bloque "Filtros avanzados" (separado visualmente por `<Separator>` y un label "Filtros avanzados") porque cubre estados de ciclo de vida que los chips no exponen (`Enviada`, `En revisión`, `Aprobada`, `Publicada`, `Sent`, `Necesita cambios`). Forzar `position="popper" sideOffset={4}` en los SelectContent para evitar solapamiento residual.

**C.2 Modelo de badges en cards (precedencia única)**

Documentado como JSDoc encima del bloque de render. Máximo 2 badges:

1. **Primario (siempre 1)** — derivado de `priorityBucket`:
   - 0 → `Sin asignar` (status-bad)
   - 1 → `Por coordinar` (amber)
   - 2 → `Programada` (status-regular)
   - 3 → `En progreso` (primary)
   - 5 → `Completada` (status-good)

2. **Secundario (solo si bucket=0)** — `missingAssignmentLabel`:
   `Faltan ambos` | `Falta inspector` | `Falta ejecutivo`

3. **Eliminar `<InspectionStatusBadge>` de las cards de la lista.** Su valor ya está representado por el bucket primario y duplica con `Sin asignar`. El estado bruto sigue visible en `AdminInspectionDetail`, donde tiene contexto.

### D. `Datos del inmueble` completo y agrupado

**D.1 Enriquecer `PropertyBriefingCard.tsx`** (read-only, sin reintroducir inputs). Mantiene los tres bloques agrupados existentes:

**Bloque B — Fechas clave** (sin cambios):
- Recolección de llaves
- Término de contrato

**Bloque C — Detalles de la propiedad** (agregar):
- ID Propiedad (existente)
- Nº Dpto/Casa (existente)
- Tipo (existente)
- Mercado (existente)
- Torre (existente)
- **Dormitorios** ← `bedrooms_count` (mostrar "Estudio" si =0 y propertyType='estudio')
- **Baños** ← `bathrooms_count`
- **Bodega** ← `has_storage` true → "Sí" + `storage_number` si existe; false → "No"
- **Estacionamiento** ← `has_parking` + `parking_number`, misma lógica
- **Garantía** ← `warranty_deposit` formateado (CLP/MXN según market), solo si presente

**Bloque D — Datos de contacto/contexto** (agregar):
- Inquilino (existente)
- WhatsApp (existente)
- **Correo receptor** ← `recipient_email` (icono Mail)
- Acciones: Cómo llegar / WhatsApp (existente)

**D.2 Estructurales read-only**
Verificado: el único input del snapshot en `AdminInspectionDetail.tsx` es `Fecha de término real de contrato` y ya está `readOnly` con `bg-muted`. `PropertyOverrideEditor` ya fue removido. Header de "Acciones Administrativas" se actualiza con copy: *"Solo campos operativos. Los datos estructurales del inmueble vienen de REM y no son editables."*

**D.3 Editables operacionales (sin cambios funcionales)**
Inspector / Ejecutivo, devolución de llave + sync, forzar avance, eliminar, notas internas / observaciones por sección.

---

### Archivos tocados

- `src/lib/inspector-operational.ts` — agregar `priorityBucket`, `priorityBucketLabel`, `missingAssignmentLabel` como fuente única.
- `src/pages/admin/AdminInspections.tsx` — quitar tab Workload + cómputo + Stat. Envolver filtros en Card con bloque "Filtros avanzados" colapsable (Estado conservado). Eliminar `<InspectionStatusBadge>` de las cards. Importar helpers compartidos. JSDoc de precedencia de badges.
- `src/pages/admin/AdminDashboard.tsx` — reframe: 4 tiles operativos, queue Sin asignar, Workload Inspectores, Workload Ejecutivos. Conservar Próximas / Sin devolución / Recientes.
- `src/components/PropertyBriefingCard.tsx` — agregar bedrooms_count, bathrooms_count, has_storage (+number), has_parking (+number), warranty_deposit, recipient_email, manteniendo los 3 bloques (Fechas / Detalles / Contacto).

Sin migraciones. Sin cambios en RLS. Sin cambios en lógica de resolución HubSpot. Sin cambios en flujo de inspector/ejecutivo. Estructurales del inmueble permanecen read-only.

