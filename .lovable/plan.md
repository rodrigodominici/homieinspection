# Arreglar "Republicar" para ejecutivas

## Qué pasa
Emily (ejecutiva) recibe "new row violates row-level security policy for table inspection_audit_log" al publicar o republicar.

Causa confirmada: la función de publicación corre con los permisos de quien la usa, y al final registra la publicación en el historial de auditoría. Ese historial solo permite escribir a administradores, así que para ejecutivas falla todo y no se publica nada. Los admins no ven el problema. Esto apareció con el historial de cotizaciones.

## Arreglo
- Hacer que la función de publicación escriba el registro de auditoría con permisos del sistema (como ya lo hacen finalizar, asignar OT, etc.), manteniendo sus validaciones actuales: solo admin o la ejecutiva asignada, solo check-out/captación.
- No abrir el historial de auditoría para escritura directa de ejecutivos.

## Verificación
- Republicar como una cuenta ejecutiva de prueba asignada a una inspección de prueba: se crea la versión nueva y queda el registro de auditoría.
- Confirmar que una ejecutiva no asignada sigue bloqueada.
- Después, Emily puede republicar sin publicar la app (el cambio es en la base de datos y aplica de inmediato).

## Detalle técnico
Migración: `ALTER FUNCTION public.publish_quotation_version(uuid, jsonb) SECURITY DEFINER;` + `REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;`. Revisar también el insert directo de `quotation-discount.service.ts` (mismo problema para ejecutivos al aplicar descuentos).
