
## Diagnóstico

Reviewed `inspection_signatures` para `5adefafc…` (Carvajal 0330 D 901): existe **una única fila con `signature_status = 'unavailable'` y `signature_data = NULL`**, creada el 2026-07-02 01:11 por el inspector. Es decir, la firma "desapareció" y quedó registrada como no firmada.

Al leer el código de guardado (`InspectorSectionComplete.tsx` L579-602, `InspectorInspectionDetail.tsx` L336-359 y `AdminInspectionDetail` L408), encuentro el patrón peligroso que explica el síntoma:

```ts
await supabase.from('inspection_signatures').delete().eq('inspection_id', id);
await supabase.from('inspection_signatures').insert({ ... });
```

Problemas concretos:

1. **No es transaccional**: si el `delete` corre y el `insert` falla (pérdida de red mid-save, payload PNG grande, RLS, timeout, tab en background, etc.), la firma anterior queda borrada y no se reemplaza. El usuario ve "guardado" porque el UI local (`setPersistedSignature`) se actualiza sin esperar confirmación de éxito.
2. **Sin manejo de error**: ningún `if (error)` ni toast; el fallo del `insert` es silencioso.
3. **No hay `UNIQUE (inspection_id)`**: permite filas duplicadas y obliga al patrón delete+insert en vez de un upsert atómico.
4. **Dos escritores** (`InspectorSectionComplete` y `InspectorInspectionDetail`) pueden pisar la firma del otro si el inspector navega entre pantallas: el `delete` de uno borra la firma que el otro acaba de guardar.
5. **Sobrescritura por "No puede firmar"**: si tras firmar el inspector abre la hoja y por error toca "unavailable"/"refused" sin firmar, `handleSigConfirm` borra la firma y guarda estado vacío. Este parece ser exactamente el caso observado (fila con `unavailable`, sin data).

## Cambios propuestos

### 1. Base de datos (migración)
- Añadir `UNIQUE (inspection_id)` sobre `inspection_signatures` (previa deduplicación si hubiese duplicados; hoy 0 casos).
- Añadir `CHECK` que exija `signature_data IS NOT NULL` cuando `signature_status = 'signed'`.
- Añadir `updated_at` + trigger `update_updated_at_column` para poder auditar reemplazos.

### 2. Frontend — guardado atómico
Reemplazar `delete + insert` por **upsert transaccional** en los 2 puntos de escritura:

```ts
const { error } = await supabase
  .from('inspection_signatures')
  .upsert({
    inspection_id,
    signer_name: ...,
    signature_data,
    signature_status,
    skip_reason,
    signed_at: new Date().toISOString(),
    created_by: profile?.id,
  }, { onConflict: 'inspection_id' });

if (error) {
  toast({ title: 'No se pudo guardar la firma', description: error.message, variant: 'destructive' });
  return; // NO limpiar estado local, NO cerrar el pad
}
// solo entonces: setPersistedSignature(...), cerrar pad, marcar handled
```

Esto elimina la ventana entre delete e insert y garantiza que un fallo no destruya la firma previa.

### 3. UX de la hoja de firma (`SignaturePad`)
- Al abrir el pad cuando ya existe una firma válida (`signature_status='signed'` con data), mostrar aviso claro: *"Ya hay una firma guardada. Confirmar reemplazará la anterior."* y precargar el modo "Firmar" (no "No puede firmar").
- Deshabilitar el botón "Confirmar" mientras el `upsert` está en vuelo para evitar doble click.

### 4. Higiene del registro actual de Carvajal 0330 D 901
- No revertir automáticamente: la fila `unavailable` es lo que quedó y no tenemos la firma real. Documentar en el plan que el inspector debe re-firmar desde la app; con el upsert ya no se perderá.

## Archivos a modificar

- `supabase/migrations/…_signature_unique_and_check.sql` (nueva)
- `src/pages/inspector/InspectorSectionComplete.tsx` (`handleSigConfirm`)
- `src/pages/inspector/InspectorInspectionDetail.tsx` (`handleSignatureConfirm`)
- `src/components/SignaturePad.tsx` (aviso reemplazo + guard doble-submit)

## Fuera de scope
- Cambiar el flujo del `AdminInspectionDetail` (solo lee; el delete que tiene es dentro de `handleDelete` de la inspección completa, correcto).
- Compresión del PNG de firma (evaluar si vuelven a reportarse fallos por tamaño tras el fix).
