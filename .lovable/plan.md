
## Problema

En el header del detalle de inspección hoy conviven tres señales que dicen casi lo mismo cuando el propietario envió feedback:

1. Badge `Publicada` (junto al nombre de la propiedad) — viene del status operativo `published`.
2. Chip naranja `FEEDBACK PENDIENTE` (esquina derecha) — viene de `owner_feedback_status = 'pending_executive_review'`.
3. Badge `1` sobre el paso `Publicación` del stepper — mismo origen que el anterior.

Resultado: ruido visual, dos colores compitiendo, y el usuario no sabe cuál es el estado "real" de la inspección.

## Regla de estado único

El badge junto al título debe reflejar **el estado accionable actual**, no el último evento técnico. Cuando hay feedback del propietario, ese es el estado que importa; "Publicada" pasa a ser contexto secundario.

Matriz de visualización propuesta:

```text
status          owner_feedback_status     Badge título            Chip derecha
─────────────────────────────────────────────────────────────────────────────
published       none                      Publicada (verde)       —
published       pending_executive_review  Feedback pendiente      —   ← reemplaza
                                          (ámbar, accionable)
published       accepted                  Aceptada (esmeralda)    —   ← reemplaza
in_review/...   *                         (estado actual)         —
```

El badge `1` sobre el paso "Publicación" del stepper se conserva: ahí sí aporta (te lleva al panel donde se resuelve), no compite con el título.

## Cambios

### `WorkflowStepper.tsx`
- Quitar los dos chips de la derecha (`Publicado`, `Feedback pendiente`, `Aceptado por propietario`). Toda esa información se mueve al badge junto al título.
- Reemplazar `<InspectionStatusBadge status={inspection.status} />` por un nuevo helper local `HeaderStatusBadge` que recibe `status` + `ownerFeedbackStatus` y decide qué mostrar según la matriz de arriba.
- El paso "Publicación" mantiene su badge numérico cuando `ownerPending` (ya está).
- Cuando `ownerPending`, el badge del título es clickeable y navega a `mode = 'publish'` (mismo comportamiento que tenía el chip).

### `HeaderStatusBadge` (nuevo, en el mismo archivo del stepper o en `status-registry.ts`)
- Variante por defecto: delega en `InspectionStatusBadge`.
- Variante `pending_executive_review`: ámbar, label "Feedback pendiente", icono `Info`, clickeable.
- Variante `accepted`: esmeralda, label "Aceptada por propietario", icono `Check`.

### Sin cambios de datos
No tocamos status registry global, ni la cola, ni `OwnerFeedbackPanel`. Solo el header del detalle.

## Resultado

Una sola señal de estado por contexto: el título dice qué hacer ahora ("Feedback pendiente"), el stepper dice dónde hacerlo (badge en paso 4), el panel dice el detalle. Se elimina la duplicación visual de la captura.
