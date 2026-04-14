

# Plan: Fix Logia (matrix) + Otros Generales (operational form)

## Summary

Replace incorrect Logia fields with an 8-item matrix. Replace incorrect Otros Generales matrix with an operational closing form. Make validation generic (pattern-based). 4 files changed, no migrations.

---

## Change 1: Logia matrix in generator (`src/lib/inspection-generator.ts`)

**Remove** lines 282-290 (the current 5 simplified Logia fields: `logia_status`, `logia_heater_type`, `logia_heater_maintenance_date`, `logia_gas_type`, `logia_observation`, `logia_photos`).

**Replace with**:

```typescript
// Logia o Armario de Boiler/Calentador — matrix items
...makeMatrixFields('logia', [
  'Calefón', 'Thermo', 'Inspección Gas', 'Grifería Lavadero',
  'Lámpara', 'Enchufes', 'Interruptor', 'Armario',
], 'logia_matrix'),
// Logia observation + photos
{ field_key: 'logia_observation', field_label: 'Observaciones Logia', field_type: 'textarea', group_key: 'logia', sort_order: 68, required: false },
{ field_key: 'logia_photos', field_label: 'Fotos Logia', field_type: 'photo_upload', group_key: 'logia', sort_order: 69, required: false },
```

Update `KITCHEN_GROUP_LABELS` in the renderer to add:
```typescript
logia_matrix: 'Logia o Armario de Boiler/Calentador',
logia: 'Logia — Observaciones',
```

---

## Change 2: Otros Generales as `closing_operational` (`src/lib/inspection-generator.ts`)

**Remove** lines 403-421 (current matrix-based `otrosItems`).

**Replace with** a new section using `section_type: 'closing_operational'`:

```typescript
sections.push({
  section_key: 'otros_generales',
  section_title: 'Otros Generales',
  section_type: 'closing_operational',
  sort_order: order++,
  fields: [
    { field_key: 'og_limpieza', field_label: '¿Se requiere limpieza?', field_type: 'single_select', group_key: 'operational', sort_order: 0, required: true,
      options_json: [
        { value: 'profunda', label: 'Profunda' },
        { value: 'basica', label: 'Básica' },
        { value: 'no_requiere', label: 'No se requiere limpieza' },
      ] },
    { field_key: 'og_retiro_enseres', field_label: '¿Retiro de Enseres (Inmueble / Bodega)?', field_type: 'single_select', group_key: 'operational', sort_order: 1, required: true,
      options_json: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
    { field_key: 'og_fumigacion', field_label: '¿Requiere Fumigación?', field_type: 'single_select', group_key: 'operational', sort_order: 2, required: true,
      options_json: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
    { field_key: 'og_medidores_obs', field_label: 'Observaciones / Lectura y Número de medidores (Luz / Agua / Gas)', field_type: 'textarea', group_key: 'operational', sort_order: 3, required: false },
    { field_key: 'og_medidores_photos', field_label: 'Fotos Medidores y Otras', field_type: 'photo_upload', group_key: 'operational', sort_order: 4, required: false },
    { field_key: 'og_admin_contacto', field_label: 'Nombre Administrador / Mayordomo, teléfono y correo electrónico', field_type: 'textarea', group_key: 'operational', sort_order: 5, required: false },
  ],
});
```

---

## Change 3: Generic matrix validation (`src/lib/section-completion.ts`)

**Replace** the hardcoded `group_key === 'status'` filter with a generic pattern-based check. A field is a "matrix field requiring validation" if its options match the status pattern (contains `bueno` as a value).

```typescript
export function canCompleteSection(
  _sectionType: string,
  fieldValues: Pick<InspectionFieldValue, 'group_key' | 'value_text' | 'is_visible' | 'value_json'>[],
  _sectionKey?: string,
  _photoCount?: number,
): CompletionResult {
  // Generic: any field with Bueno/Regular/Malo/NA options is a mandatory matrix field
  const matrixFields = fieldValues.filter((f) => {
    if (!f.is_visible) return false;
    const opts = (f.value_json as { options?: Array<{ value: string }> })?.options;
    return Array.isArray(opts) && opts.some(o => o.value === 'bueno');
  });

  // Also validate required single_select fields (operational sections)
  const requiredSelects = fieldValues.filter((f) => {
    if (!f.is_visible) return false;
    if (matrixFields.includes(f)) return false; // already counted
    const opts = (f.value_json as { options?: Array<{ value: string }> })?.options;
    return Array.isArray(opts) && opts.length > 0 && f.group_key === 'operational';
  });

  const allMandatory = [...matrixFields, ...requiredSelects];

  if (allMandatory.length === 0) return { valid: true };

  const allAnswered = allMandatory.every(
    (f) => f.value_text !== null && f.value_text !== '',
  );

  if (!allAnswered) {
    const unanswered = allMandatory.filter(
      (f) => f.value_text === null || f.value_text === '',
    ).length;
    return {
      valid: false,
      reason: `${unanswered} elemento(s) sin respuesta. Selecciona un estado para cada uno.`,
    };
  }

  return { valid: true };
}
```

This approach:
- Automatically catches `status`, `appliance`, `logia_matrix`, and any future matrix group — no hardcoded group names
- Also validates `operational` group `single_select` fields (for Otros Generales)
- Keeps non-standard sections (no matching fields) passable

---

## Change 4: Renderer updates (`src/pages/inspector/InspectorSectionComplete.tsx`)

### 4a. Add `closing_operational` to section routing (line 631)

Add `'closing_operational'` to the condition that routes to `renderStandardSection()`. The existing `renderStandardSection` + `renderGroupCard` + `renderField` pipeline already handles `single_select` (non-status chips), `textarea`, and `photo_upload` correctly.

### 4b. Update Kitchen group labels

```typescript
const KITCHEN_GROUP_LABELS: Record<string, string> = {
  status: 'Estado Cocina',
  appliance: 'Electrodomésticos',
  technical: 'Datos Técnicos',
  logia_matrix: 'Logia o Armario de Boiler/Calentador',
  logia: 'Logia — Observaciones',
};
```

### 4c. Update `handleMarkComplete` unanswered field detection (lines 226-231)

Replace the hardcoded `group_key === 'status'` check with the same generic pattern:

```typescript
fields.forEach((f) => {
  if (!f.is_visible) return;
  const opts = (f.value_json as any)?.options;
  const isMatrix = Array.isArray(opts) && opts.some((o: any) => o.value === 'bueno');
  const isOperational = f.group_key === 'operational' && Array.isArray(opts) && opts.length > 0;
  if ((isMatrix || isOperational) && (!f.value_text || f.value_text === '')) {
    missing.add(f.id);
  }
});
```

---

## Change 5: AdminSettings documentation (`src/pages/admin/AdminSettings.tsx`)

Update the Logia and Otros Generales descriptions:

**Logia**: Document as matrix section inside Kitchen with 8 items (Calefón, Thermo, Inspección Gas, Grifería Lavadero, Lámpara, Enchufes, Interruptor, Armario) + observation/photos.

**Otros Generales**: Document as `closing_operational` section with 6 fields (limpieza, retiro enseres, fumigación, medidores obs, medidores photos, admin contacto).

---

## Files affected

| File | Change |
|---|---|
| `src/lib/inspection-generator.ts` | Replace Logia fields (8-item matrix), replace Otros Generales (operational form) |
| `src/lib/section-completion.ts` | Generic pattern-based validation (no hardcoded group names) |
| `src/pages/inspector/InspectorSectionComplete.tsx` | Add `closing_operational` routing, update Kitchen labels, generic unanswered detection |
| `src/pages/admin/AdminSettings.tsx` | Update Logia + Otros Generales documentation |

4 files. No migrations.

