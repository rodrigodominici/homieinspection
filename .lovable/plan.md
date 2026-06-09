# Evidencia de aprobación del propietario en el historial

## Contexto

Hoy, cuando el propietario acepta (vía link público) o el ejecutivo hace cierre manual, la aprobación queda persistida en:
- `inspection_owner_feedback_submissions` (con `submitter_name`, `submitted_at`, `all_accepted=true`, y `summary_json.manual_closure` si aplica).
- `inspections.owner_feedback_status='accepted'` + `approved_at`.

Pero esa aprobación **no se ve** en el `PublishedVersionsTimeline` del panel de Publicación. Solo se ve en `OwnerFeedbackPanel` (que muestra la versión vigente). El usuario quiere que la evidencia (nombre + fecha) quede pegada a la versión correspondiente del historial.

## Alcance

### 1. Timeline de versiones — chip de aprobación por versión
Modificar `useReportVersionsHistory` para traer, además, la última submission de `inspection_owner_feedback_submissions` por `report_version_id` con `all_accepted=true`.

Por cada versión que tenga submission aprobada, agregar al entry:
- `approved_by_name`: `submitter_name` (propietario o "Cierre manual — {ejecutivo}").
- `approved_at`: `submitted_at`.
- `approval_kind`: `'owner' | 'manual'` (derivado de `summary_json.manual_closure`).

En `PublishedVersionsTimeline.tsx`, debajo de la línea de fecha/ejecutivo de cada versión aprobada, mostrar una segunda línea con un chip verde:
- "Aprobada por {nombre} · {fecha}" (ícono `CheckCircle2`).
- Variante "Cierre manual · {nombre} · {fecha}" para `approval_kind='manual'`.

Esto deja la evidencia anclada a la versión exacta sobre la que se aprobó, incluso si después hay republicaciones.

### 2. Tarjeta resumen en `OwnerFeedbackPanel`
Cuando `ownerFeedbackStatus === 'accepted'` (cualquiera de los dos caminos), garantizar que la cabecera muestre siempre, de forma consistente:
- **Nombre** de quien aprobó (submitter o `closed_by_name`).
- **Fecha** (`submitted_at` / `closed_at`).

Hoy ya se muestra en ambos casos por separado; el cambio es asegurar el mismo formato y dejarlo arriba como tarjeta resumen consolidada. No se altera la lógica de carga ni el cierre manual.

## Detalles técnicos

- Hook: una query extra a `inspection_owner_feedback_submissions` filtrada por los `version_id` del set ya cargado, ordenada `submitted_at desc`, y reducida a un mapa `versionId → { submitter_name, submitted_at, manual_closure, all_accepted }`. Solo se considera la fila más reciente por versión y solo si `all_accepted=true`.
- Sin cambios de esquema, RPC, RLS ni links públicos.
- Sin cambios en `PublishView.tsx` (el timeline ya está montado).

## Validación
- Versión aprobada por propietario → chip verde "Aprobada por {nombre} · {fecha}" debajo de esa versión en el timeline.
- Versión cerrada manualmente → chip "Cierre manual · {ejecutivo} · {fecha}".
- Republicación posterior (nueva versión vigente sin feedback aún) → versiones anteriores conservan su chip; la nueva no tiene chip hasta que llegue una nueva aprobación.
- `OwnerFeedbackPanel` sigue mostrando nombre y fecha en la cabecera de la tarjeta resumen.
