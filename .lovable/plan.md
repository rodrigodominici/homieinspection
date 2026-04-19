

## Plan refinado: estabilización end-to-end del intake

### Orden de despliegue (atómico)

Fix A + Fix B se despliegan **juntos** en una sola tanda. Ningún reintento sobre eventos fallidos antes de eso — uno sin el otro deja el pipeline roto (A sin B = SQL inválido con estructura completa; B sin A = SQL válido pero placeholder de 1 sección).

### Fix A — Portar el generador real al edge function

- **Nuevo archivo**: `supabase/functions/_shared/inspection-generator.ts` — copia portada de `src/lib/inspection-generator.ts` con imports relativos y sin alias `@/`. Incluye `generateSections()` y `normalizeIncomingPayload()`.
- **Edit**: `supabase/functions/hubspot-inspection-intake/index.ts`
  - Import: `import { generateSections, normalizeIncomingPayload } from '../_shared/inspection-generator.ts'`.
  - Reemplazar `generateBasicSections` por:
    ```ts
    const normalized = normalizeIncomingPayload(body.data);
    const generatedStructure = { sections: generateSections(normalized) };
    ```
  - **Fallback temporal** (deprecado, solo para replays/tests): si `body.data.__generated__` viene precomputado, se respeta y se loguea `processing_step: 'structure_generation_skipped_precomputed'`. Marcado con comentario `// TODO: remove after intake stabilization (target: 2 sprints)`.

### Fix B — Reescribir RPC sin CTE anidado con INSERT

Migración nueva que reemplaza `create_inspection_from_event`. Estructura por etapas, cada una con su propio `BEGIN ... EXCEPTION` y `failure_reason` específico:

```text
v_processing_step := 'inspection_insert';
INSERT INTO inspections ... RETURNING id INTO v_inspection_id;

v_processing_step := 'sections_insert';
WITH ins AS (INSERT INTO inspection_sections ... RETURNING id, section_key)
SELECT id, section_key BULK COLLECT INTO v_section_map FROM ins;
-- alternativa: tabla temp ON COMMIT DROP

v_processing_step := 'field_values_insert';
INSERT INTO inspection_field_values ...
SELECT ... FROM jsonb_array_elements(...) JOIN _ins_sections ...;

v_processing_step := 'event_update';
UPDATE inspection_source_events SET processing_status='completed' ...;
```

CTE con INSERT solo aparece como **statement raíz**, nunca anidado en `PERFORM (... )`.

### Fix C — Taxonomía de fallas + processing_step

- `failure_reason` (categoría): `payload_validation`, `structure_generation`, `inspection_insert`, `sections_insert`, `field_values_insert`, `event_update`, `assignment_resolution`, `unknown`.
- **Nueva columna** `processing_step text` en `inspection_source_events` — marcador granular escrito justo antes de cada operación. Si revienta, queda como "última etapa intentada" para debug. Migración aditiva, default null.
- Edge function actualiza `processing_step` antes de validar/normalizar/generar; la RPC lo actualiza antes de cada bloque SQL.
- UI de Logs ya muestra `failure_reason`; agregar línea con `processing_step` debajo (1 edit en `AdminIntegrationHubSpotLogs.tsx`).

### Fix D — Política de retryability

Edit en `supabase/functions/retry-source-event/index.ts`:

- **No-retryable** → 409: `payload_validation`, `structure_generation`, o cuando `error_message` contenga `violates check constraint` / `data-modifying statement` / `column does not exist`.
- **Retryable**: `event_update`, `unknown`, errores de timeout/red.
- UI deshabilita botón "Reintentar" cuando aplica (lectura de `failure_reason`).

### Riesgo documentado: drift de generadores

Después de portar, **`supabase/functions/_shared/inspection-generator.ts` es la fuente canónica para ingestión externa** (HubSpot y futuros webhooks). `src/lib/inspection-generator.ts` queda como espejo para el flujo manual del cliente.

Mitigaciones:
- Comentario header en ambos archivos: `// CANONICAL: supabase/functions/_shared/inspection-generator.ts. Mirror in src/lib/ — sync manually until consolidation.`
- Nota en `docs/ADR-001-canonical-architecture.md` documentando el drift y el plan de consolidación (build step que copie shared → src, o publicar como paquete interno).
- Test de paridad mínimo: snapshot de `generateSections()` con el payload de departamento 2D/1B en ambos lados, comparados en `vitest`.

### Verificación post-deploy

1. Reintentar `d62acc32` (emails null) → esperado: `completed`, inspección en `pending_assignment` con ~15 secciones.
2. Reintentar `13eac710` (emails válidos) → esperado: `completed`, inspección en `assigned` con IDs resueltos.
3. Confirmar en `inspection_sections` que cada inspección nueva tiene >1 fila.

### Archivos tocados

- **Nuevo**: `supabase/functions/_shared/inspection-generator.ts`
- **Edit**: `supabase/functions/hubspot-inspection-intake/index.ts`
- **Edit**: `supabase/functions/retry-source-event/index.ts`
- **Edit**: `src/pages/admin/AdminIntegrationHubSpotLogs.tsx` (mostrar `processing_step`)
- **Migración**: nueva RPC + columna `processing_step`
- **Edit**: `src/lib/inspection-generator.ts` (header comment)
- **Edit**: `docs/ADR-001-canonical-architecture.md` (sección drift)
- **Nuevo test**: `src/test/generator-parity.test.ts`

