## Diagnóstico actual (verificado)

- Los dos paneles siguen en el código: `ExecutiveLoadChart.tsx` ("Carga por ejecutivo") y `OwnerAgingPanel.tsx` ("Aging de propietario"), ambos en `src/pages/admin/dashboard/`.
- `AdminDashboard.tsx` los importa y los renderiza bajo los KPIs (líneas 182-183).
- La ruta `/admin` sigue protegida para el rol `admin`.
- Tu cuenta `rodrigo.dominici@homie.mx` tiene `role = admin`, `is_active = true`, `approval_status = approved`, así que el permiso no es el problema.

Conclusión: no hubo eliminación en código ni bloqueo por permisos. Queda por confirmar en ejecución si el problema es (a) que la versión publicada en `app.inspection.homie.mx` es anterior a estos paneles, o (b) que la consulta de datos del dashboard falla y los paneles quedan vacíos/ocultos. No voy a afirmar la causa hasta comprobarlo.

## Paso 1 — Verificar en ejecución

- Abrir `/admin` en el preview con sesión de admin y capturar pantalla + consola/red para confirmar si los paneles se montan y con qué datos.
- Si en preview se ven bien, la causa es que producción no tiene el último deploy: se resuelve republicando.
- Si en preview tampoco se ven, revisar la query `fetchDashboardInspections` (columnas proyectadas y condiciones de agrupación) y las condiciones internas de cada panel que pueden hacer que se rendericen vacíos.

## Paso 2 — Ampliar con métricas de desempeño por ejecutivo

Nuevo panel "Desempeño por ejecutivo" en el dashboard admin, alineado visualmente con los dos existentes (misma tarjeta, tipografía y tokens), con una fila por ejecutivo y columnas:

- **Velocidad**: mediana de horas entre envío del inspector y cierre de revisión, y entre envío y publicación.
- **Retrabajo**: versiones publicadas por informe (republicaciones).
- **Presupuesto**: ítems por inspección, monto cliente y margen implícito vs costo contratista.
- **Ciclo propietario**: tasa de aceptación y publicadas sin respuesta.

Cada fila es clickeable y lleva al listado de inspecciones filtrado por ese ejecutivo, igual que los paneles actuales.

## Detalles técnicos

- Los tiempos se calculan con `completed_at`, `review_completed_at`, `budget_completed_at`, `published_at` y `owner_feedback_last_submitted_at` de `inspections`.
- El retrabajo sale de `inspection_report_versions` (conteo por `inspection_id` y `published_by`).
- Presupuesto y margen salen de `inspection_repair_items` (`subtotal`, `contractor_unit_price * quantity`).
- Para evitar traer todas las filas al cliente, agregar una función de base de datos de solo lectura que devuelva las métricas ya agregadas por ejecutivo, restringida a rol `admin`; el panel la consume vía `useQuery`.
- Sin cambios de esquema ni de RLS existentes.

## Fuera de alcance

- No se toca la lógica de los estados ni de publicación.
- No se modifican los paneles de inspector.
