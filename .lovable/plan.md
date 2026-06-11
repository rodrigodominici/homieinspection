## Objetivo
Mostrar un indicador de "días en feedback del propietario" en las tarjetas del grupo "Feedback del propietario" de la cola ejecutiva, para visualizar cuánto tiempo lleva una inspección esperando respuesta del ejecutivo.

## Cálculo
- Fuente: `inspections.owner_feedback_last_submitted_at` (timestamp del último envío del propietario que dejó el estado en `pending_executive_review`).
- Métrica: días enteros transcurridos desde ese timestamp hasta hoy (`Math.floor((now - submittedAt) / 86_400_000)`).
- Etiqueta:
  - `0` días → "Hoy"
  - `1` día → "1 día esperando"
  - `n > 1` → "{n} días esperando"
  - Sin timestamp → no mostrar indicador.

## Cambio en `src/pages/executive/ExecutiveReviewQueue.tsx`

En `InspectionRow` (línea ~457, dentro de la línea 3 de meta), cuando `bucket === 'owner_feedback'` y exista `insp.owner_feedback_last_submitted_at`, agregar un chip/pill al inicio del bloque meta:

```tsx
{bucket === 'owner_feedback' && waitingLabel && (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-status-bad/10 text-status-bad font-medium">
    <Clock className="h-3 w-3" />
    {waitingLabel}
  </span>
)}
```

Con `waitingLabel` derivado en el `useMemo` correspondiente a partir de `insp.owner_feedback_last_submitted_at`.

## Fuera de alcance
- Cambios en KPIs, filtros, otros buckets, vista de detalle ejecutivo o admin.
- Lógica de backend / migraciones.