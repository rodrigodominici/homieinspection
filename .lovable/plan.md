## Diagnóstico

El cierre manual (botón "Cerrar manualmente" del panel de feedback del propietario) llama al RPC `executive_force_close_owner_feedback`. Ese RPC intenta escribir en `inspection_audit_log` así:

```sql
INSERT INTO inspection_audit_log (inspection_id, actor_id, action, payload) VALUES (...)
```

Pero la tabla real tiene otro esquema:

| Columna en RPC | Columna real          |
|----------------|------------------------|
| `actor_id`     | `performed_by`         |
| `payload`      | `note` (texto, no jsonb) |

Además, la tabla tiene columnas `previous_status` / `new_status` que el RPC no está aprovechando. Resultado: al confirmar el cierre manual sale el error `column "actor_id" of relation "inspection_audit_log" does not exist` y la transacción hace rollback — la inspección queda sin cerrar.

Esto afecta a Zañartu 980 y a cualquier otra inspección donde el ejecutivo intente el cierre manual del feedback.

## Cambios propuestos

Migración one-shot para reemplazar el RPC `executive_force_close_owner_feedback` con la única línea de INSERT corregida (todo lo demás del RPC queda igual: validaciones, submission sintética, update de la inspección):

```sql
INSERT INTO inspection_audit_log (
  inspection_id, performed_by, action, previous_status, new_status, note
) VALUES (
  p_inspection_id,
  v_uid,
  'owner_feedback_manual_closure',
  v_old_status,
  'approved',
  -- Serializamos el detalle (motivo + nota + estado anterior de feedback) como texto legible
  format('reason=%s; owner_feedback: %s -> accepted%s',
         p_reason,
         v_old_feedback_status,
         CASE WHEN NULLIF(trim(coalesce(p_note,'')), '') IS NOT NULL
              THEN '; note=' || trim(p_note) ELSE '' END)
);
```

No se toca ningún otro comportamiento (submission sintética, `status='approved'`, `current_stage='share'`, `owner_feedback_status='accepted'`, `approved_at/by`).

## Verificación

- Abrir Zañartu 980 → botón "Cerrar manualmente" → elegir "Aprobado fuera de la plataforma" con la nota "Aprobado vía correo" → debe cerrarse sin error y quedar `status=approved`, `current_stage=share`, `owner_feedback_status=accepted`.
- Revisar `inspection_audit_log` para esa inspección → debe existir una fila con `action='owner_feedback_manual_closure'`, `performed_by = ejecutivo`, `previous_status='published'`, `new_status='approved'`, `note` con el motivo y la nota.
- Los cierres manuales que ya se hicieron antes no se ven afectados (esto es puramente el bug de escritura del log).

## Nota

No se cambia lógica de aprobación, ni RLS, ni notificaciones. Solo se alinean los nombres de columna del INSERT con el esquema real de `inspection_audit_log`.