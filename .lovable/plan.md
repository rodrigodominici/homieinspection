## Qué revisé (datos reales, no supuestos)

- **Salud del backend**: base de datos arriba, sin reinicios, memoria 46%, disco 4%, pool 1/200, **conexiones 35/60 (moderado)**, 16.535 transacciones con rollback desde el último arranque. No hay caída de servidor: el problema es de **latencia por consultas**, no de infraestructura caída.
- **Cambios de ayer/hoy** (git): rol Comercial + sus políticas RLS (28-jul 16:53) y ampliación de visibilidad a captación (29-jul 16:48). El resto fueron cambios de UI (tags, filtros, dashboards).
- **Consultas más lentas** (pg_stat_statements): el mayor consumo acumulado del sistema es la resolución de objetos de storage al firmar URLs de fotos:
  - `SELECT id FROM storage.objects WHERE name=$1 AND bucket_id=$2` → **168.105 llamadas, media 46,6 ms** (una segunda variante equivalente: 115.582 llamadas, media 14,8 ms).
  - Consultas de PostgREST sobre `inspection_photos`, `inspection_sections`, `inspection_field_values` con picos de **1,7 s a 5,5 s** (max_ms).
- **Datos**: 121 inspecciones, 14.124 fotos. **No existe índice sobre `inspection_photos.storage_path`** (verificado).
- **Políticas RLS**: la migración del rol Comercial agregó políticas SELECT *permisivas* en `inspections`, `inspection_sections`, `inspection_field_values`, `inspection_photos`, `inspection_signatures`, `profiles` y **`storage.objects`**. Las políticas permisivas se evalúan (en OR) **para todos los usuarios autenticados**, no solo para el rol Comercial.

## Causa más probable

La política nueva sobre `storage.objects`:

```text
bucket_id = 'inspection-photos'
AND has_role(auth.uid(),'comercial')
AND EXISTS (SELECT 1 FROM inspection_photos p
            WHERE p.storage_path = storage.objects.name
              AND is_visible_checkout_for_comercial(p.inspection_id))
```

Se evalúa en **cada firma de URL de foto** de inspectores, ejecutivos y admins. Como `storage_path` no tiene índice, el subquery puede recorrer las 14 mil filas de `inspection_photos`, y `auth.uid()`/`has_role` sin envolver en `(select ...)` se re-evalúan por fila. Eso encaja con la media de 46 ms por lookup de storage y con la lentitud generalizada al abrir inspecciones con muchas fotos (decenas de firmas por pantalla). La última migración además creó la política de `inspections` **sin `TO authenticated`**, por lo que también se evalúa para visitantes anónimos (reportes públicos).

Esto es una hipótesis fuerte pero **no confirmada aún**: el primer paso del plan es confirmarla con `EXPLAIN ANALYZE` antes de tocar nada.

## Plan

1. **Confirmar el diagnóstico** (solo lectura): `EXPLAIN ANALYZE` de la firma de URL con y sin la política de `storage.objects`, y comparar el plan del `SELECT ... FROM storage.objects WHERE name=... AND bucket_id=...`. Revisar también logs de PostgREST/Auth por 5xx y timeouts en las últimas 48 h.
2. **Índice faltante**: crear `CREATE INDEX CONCURRENTLY idx_inspection_photos_storage_path ON public.inspection_photos (storage_path);`
3. **Reescribir la política de `storage.objects`** para que sea barata y cortocircuite:
   - restringirla con `TO authenticated`,
   - envolver la comprobación de rol en `(SELECT public.has_role((SELECT auth.uid()),'comercial'))` para que se evalúe una sola vez (InitPlan) y no por fila,
   - eliminar el `EXISTS` correlacionado o reemplazarlo por una función `STABLE` con un único lookup indexado.
4. **Aplicar el mismo patrón** a las políticas Comercial de `inspections`, `inspection_sections`, `inspection_field_values`, `inspection_photos`, `inspection_signatures` y `profiles`: agregar `TO authenticated` (falta en la de `inspections`) y envolver `auth.uid()`/`has_role` en subselects para que no se evalúen fila por fila.
5. **Revisar la política amplia de `profiles`** para Comercial (hoy permite leer cualquier perfil): acotarla a las columnas/uso necesario o a perfiles con rol operativo.
6. **Reducir el volumen de firmas de URL en el cliente**: hoy cada foto se firma individualmente (`getSignedPhotoUrlMap` hace N llamadas en paralelo). Pasar a firmado por lotes (`createSignedUrls` acepta un array) reduce cientos de round-trips por pantalla a uno solo, y baja la presión sobre conexiones.
7. **Verificar**: volver a medir `pg_stat_statements` (media y max de los lookups de storage), abrir una inspección con muchas fotos como ejecutivo e inspector y comparar tiempos antes/después.

## Detalle técnico

- Las políticas permisivas en Postgres se combinan con `OR`, por lo que una política costosa penaliza a **todos** los roles, incluso a quienes ya tenían acceso por otra política. Por eso un cambio pensado "solo para Comercial" degradó a toda la aplicación.
- No se modificará la lógica de negocio ni los permisos efectivos: los roles verán exactamente lo mismo que hoy, solo cambia cómo se evalúan las políticas.
- No hay evidencia de saturación de CPU/memoria del instance, así que **no** propongo aún subir el tamaño del Lovable Cloud; si tras el fix persisten timeouts con 35+ conexiones, lo reevaluamos.
