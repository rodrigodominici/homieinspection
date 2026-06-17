# Limpieza de inspecciones + fotos del bucket

## Inspecciones a conservar (7)

| Propiedad | ID |
|---|---|
| Doctor johw 995 D 1219 | `cb5cc308-09ec-4d69-b433-87c937563764` |
| Constantino 141 D 1205 | `f778e3d5-b245-4fc3-9fc4-8a88cd239985` |
| Radal 0102 D 1612 | `9d33f306-e3f9-47cb-9c57-55f6c3092a2d` |
| Coronel Godoy 149 D 2104 | `59973a45-3ea7-4e3f-9859-f454e0c80b1f` |
| General Mackenna 1555 D 813 | `9682e699-0aa5-43f5-a9ff-3a60143b88ad` |
| Carlos Pezoa Véliz 190 D 212 | `383b04cf-9f0e-47af-9eb3-b8a9a05d51ce` |
| Matucana 1161 D 603 | `57f656ef-6612-4eb6-9c1d-5745d8716c1a` |

## Inspecciones a eliminar

Las **106 restantes** (de 113 totales) con todos sus datos asociados.

## Pasos de ejecución

### 1. Borrar fotos físicas del bucket `inspection-photos`

Script que:
- Consulta `inspection_photos.storage_path` (o equivalente) de todas las inspecciones que NO están en la lista de 7.
- Borra esos objetos del bucket `inspection-photos` en lotes vía Storage API.
- Reporta cuántos archivos se eliminaron.

### 2. Borrar registros de base de datos (transacción única)

Borra de tablas hijas filtrando por `inspection_id NOT IN (los 7 IDs)` en orden seguro:
- `inspection_photos`
- `inspection_field_values`
- `inspection_repair_items`
- `inspection_signatures`
- `inspection_reviews`
- `inspection_owner_feedback`
- `inspection_owner_feedback_submissions`
- `inspection_report_versions`
- `inspection_quotation_discounts`
- `inspection_external_references`
- `inspection_audit_log`
- `inspection_sections`
- `communication_deliveries` (donde aplique)
- `slack_notifications_log` (donde aplique)
- `hubspot_sync_log` (donde aplique)

Luego:
- `DELETE FROM inspections WHERE id NOT IN (los 7)`
- `DELETE FROM inspection_source_events` huérfanos (sin `inspection_id` válido)

### 3. Verificación final

- `SELECT count(*) FROM inspections` → debe dar 7.
- Listar bucket `inspection-photos` y confirmar que solo quedan fotos de los 7 IDs conservados.

## Notas

- **Irreversible**. El orden es: primero fotos del bucket, luego registros DB.
- Antes de ejecutar el DELETE, te muestro el conteo de filas afectadas por tabla y el conteo de fotos a borrar del bucket para que confirmes.
