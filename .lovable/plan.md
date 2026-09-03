# Control de inspecciones incompletas (estancadas) en el tablero

## Qué encontré hoy en los datos

Sí, hay inspecciones comenzadas y no finalizadas:

- 4 en curso (`in_progress`) con avance parcial:
  - Carlos Valdovinos 129 D 307 — 14 de 16 secciones, 196 fotos (casi lista, no enviada)
  - AV. Recoleta 1061 D 1402 — 4 de 17 secciones, 0 fotos
  - San Nicolás 950 — 3 de 12 secciones, 0 fotos
  - Escuela Agrícola 1710 D 1002 — 2 de 15 secciones, 0 fotos
- 16 asignadas sin iniciar, varias muy antiguas: Carmen Mena 838 y Lincoyán 1153 llevan 13 días sin movimiento; Toro Mazote 150, Quinta Avenida 1277 y Calle Uno 6590, 10 días.
- 1 sin asignar (`pending_assignment`) y 13 en revisión/cotización (`submitted` / `in_review`).

Hoy el tablero muestra el conteo por etapa, pero no distingue entre "recién iniciada" y "abandonada", ni muestra el % de avance.

## Qué voy a agregar

### 1. Definición de "incompleta / estancada"

Una inspección se marca como estancada cuando está abierta (no publicada ni finalizada) y no registra actividad por más de:

- Asignada sin iniciar: 3 días
- En curso con avance parcial: 2 días
- En cotización / revisión: 5 días

Cada fila mostrará además el avance real (secciones completadas / totales, fotos) para saber si vale la pena rescatarla o reiniciarla.

### 2. Panel nuevo en el Dashboard Admin: "Inspecciones incompletas"

Tabla compacta ordenada por días sin actividad (más antiguas arriba), con:

- Propiedad + tipo (Check-out / Captación)
- Estado actual y barra de avance (ej. "4/17 secciones · 0 fotos")
- Días sin actividad, resaltado en rojo cuando supera el umbral
- Inspector y ejecutivo responsables
- Enlace directo al detalle de la inspección

Filtros rápidos por motivo: sin iniciar / iniciada y detenida / detenida en cotización.

### 3. KPI + filtro en Admin → Inspecciones

- Nueva tarjeta KPI "Incompletas" con el total de estancadas, roja cuando hay más de 0.
- Al hacer clic, la lista se filtra por ese conjunto (`bucket=stalled`), consistente con el resto de KPIs.
- Columna de avance visible en la lista filtrada.

### 4. Igual visibilidad para el ejecutivo

En la cola del ejecutivo, marca visual ("Sin actividad hace N días") en las tarjetas que superan el umbral, sin cambiar el orden ni los grupos actuales.

## Detalles técnicos

- `src/lib/inspection-buckets.ts`: agregar `isStalled(insp, progress)` + umbrales por etapa, y un contador `stalled` en `computeInspectionKpis` (no reemplaza los stages existentes, es un eje transversal).
- Avance: nuevo hook `useInspectionProgress` que consulta agregados por inspección (`inspection_sections` visibles vs completadas y conteo de `inspection_photos`) sólo para las inspecciones abiertas listadas, en una consulta agrupada para no cargar filas pesadas.
- Nuevo componente `src/pages/admin/dashboard/StalledInspectionsPanel.tsx`, montado en `AdminDashboard.tsx` junto a los paneles de desempeño.
- `src/pages/admin/AdminInspections.tsx`: extender `Bucket`/`BUCKET_FILTERS` con `stalled` y añadir la tarjeta KPI al grid existente.
- `src/pages/executive/ExecutiveReviewQueue.tsx`: badge de inactividad derivado del mismo helper.
- Sin cambios de esquema ni de lógica de estados: es sólo lectura y presentación. Los umbrales quedan en una constante única para ajustarlos después.
