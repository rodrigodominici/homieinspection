# Filtro por tipo de inspección en el tablero + flujo de estados del check-in

## 1. Filtro de tipo en el tablero (Admin)

Hoy el tablero solo se filtra por país (selector global) y por rango de fecha de recolección de llaves. El tipo de inspección ya viene en los datos que carga el tablero, así que solo falta exponerlo.

Cambio propuesto en la barra de filtros del tablero:

- Botones combinables "Captación", "Check-in", "Check-out" (misma pieza visual que ya se usa en Inmuebles, para mantener consistencia).
- Sin selección = todos los tipos.
- El filtro se aplica antes de calcular todo el tablero: tarjetas de KPI, carga por ejecutivo, desempeño de inspectores, aging de propietario, incompletas, próximas y sin asignar.
- El contador junto a los filtros pasa a reflejar "N de M inspecciones" considerando fecha + tipo.
- El botón Limpiar borra fecha y tipos.

## 2. Flujo de estados del check-in

El check-in registra el estado inicial de entrega al inquilino, por lo que no tiene presupuesto ni aprobación del propietario. Su recorrido es:

```text
Sin asignar -> Por coordinar -> Coordinada para recibir -> En espera de hallazgos
   -> (inspector envía) -> En revisión del ejecutivo -> Publicación (informe al inquilino)
   -> Aprobado -> Finalizado
```

Diferencias respecto al check-out:
- No aparecen las etapas de Reparaciones ni Cotización en la estación de revisión del ejecutivo (ya implementado).
- No espera decisión del propietario: no hay estado "En gestión de aprobación" ni feedback del propietario.
- El informe publicado se dirige al inquilino, no al propietario.
- La finalización sigue pidiendo la marca de "quién repara" igual que el resto (esto se puede revisar si en check-in no aplica; hoy aplica).

Si querés, en el mismo trabajo puedo dejar "quién repara" como no aplicable para check-in.

## Detalles técnicos

- `src/pages/admin/AdminDashboard.tsx`: nuevo estado `types: CanonicalInspectionType[]`, `ToggleGroup` en la barra de filtros y filtro dentro del `useMemo` de `inspections` usando `normalizeInspectionType` de `src/lib/inspection-type-labels.ts`.
- Los paneles hijos (`ExecutiveLoadChart`, `InspectorPerformancePanel`, `OwnerAgingPanel`, `StalledInspectionsPanel`) reciben la lista ya filtrada; los que consultan por RPC (desempeño) se filtran del lado del cliente cuando corresponda o se documenta que el desempeño es agregado por país.
- Sin migraciones ni cambios de esquema.
