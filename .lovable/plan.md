# Reordenar fotos en la sección Cocina / Logia

## Problema

En la pantalla `space_kitchen` (Inspector → completar sección Cocina / Electrodomésticos), todas las fotos se renderizan al final de la pantalla en un bloque común, mostrando:

1. Fotos Cocina y Electrodomésticos
2. Fotos Logia

…aunque visualmente la sección Logia (matriz Calefón/Thermo/… + observación) aparece más arriba. Resultado: el inspector termina de evaluar Logia, hace scroll y vuelve a "ver cocina" antes de las fotos de Logia.

El usuario pide que **Fotos Logia aparezca justo después del bloque Logia**, y por consistencia **Fotos Cocina justo después del bloque Cocina (observación)**.

El generador (`src/lib/inspection-generator.ts`) ya ordena los campos en ese orden lógico (kitchen matrix → appliances → technical → kitchen obs → kitchen photos → logia matrix → logia obs → logia photos). El desorden visual es puramente de render.

## Cambio (solo UI, sin tocar datos)

Archivo único: `src/pages/inspector/InspectorSectionComplete.tsx`

### 1. `renderKitchenSection()` (≈ líneas 482-534)

Inyectar las cards de fotos **inline**, no al final:

```text
[Cocina matrix card]
[Electrodomésticos matrix card]
[Técnico card]
[Observaciones Cocina card]        ← observationFields del grupo 'kitchen'/'observation'
[Fotos Cocina y Electrodomésticos] ← NUEVO inline
[Logia matrix card]
[Observaciones Logia card]         ← logiaFields (textarea)
[Fotos Logia]                       ← NUEVO inline
```

Implementación:
- Extraer la función `renderPhotoCard(title, photos, uploadFieldKey)` (hoy local al bloque tail-end de fotos, líneas ~735-770) a un helper accesible desde `renderKitchenSection`.
- Filtrar `photos` por `field_key` correspondiente (`kitchen_photos`, `logia_photos`) usando el mismo criterio que el bloque tail-end.
- Renderizar las cards en los puntos indicados.

### 2. Bloque tail-end de fotos (≈ líneas 717-770)

Cuando `sectionType === 'space_kitchen'`, **omitir** el bloque (ya se renderizó inline). Mantener el comportamiento actual para el resto de secciones (`access`, espacios estándar, etc.).

```ts
if (sectionType === 'space_kitchen') return null;
```

### 3. Sin cambios en

- `inspection-generator.ts` (orden de campos ya correcto).
- Lógica de upload/borrado/signed URLs.
- Validación / gating de fotos obligatorias (mismo `field_key`, misma data).
- Inspecciones existentes (no hay migración; solo cambia el render).

## Riesgos

- **Bajo**. Cambio cosmético en una sola pantalla. La fuente de datos, los `field_key` de upload y la lógica de progreso permanecen iguales.
- Verificar visualmente en modo read-only (inspección enviada) que las cards de fotos siguen mostrándose correctamente en su nueva posición.

## QA

1. Abrir una inspección en curso, ir a sección Cocina / Electrodomésticos.
2. Confirmar orden: Cocina → Electrodomésticos → Técnico → Obs Cocina → **Fotos Cocina** → Logia matrix → Obs Logia → **Fotos Logia**.
3. Subir/borrar fotos en ambos buckets y verificar que persisten en el `field_key` correcto.
4. Repetir en una inspección ya enviada (read-only).
