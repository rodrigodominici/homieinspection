# Nuevo rol: Property Advisor (check-in)

Un Property Advisor trabaja igual que un Inspector — mismas pantallas móviles, misma agenda, mismo formulario, mismas fotos y firma — pero solo con inspecciones de **check-in**.

## Reglas definidas

- El advisor ve **solo** inspecciones de check-in asignadas a él. Si por error se le asigna otra, no aparece.
- Al asignar responsable de un **check-in**, la lista muestra **solo Property Advisors**. Para captación y check-out, solo Inspectores.
- En los tableros de Admin, los advisors tienen su **propio panel de desempeño y filtros**, separados de los inspectores.
- Nuevos registros con este rol pasan por la misma aprobación de administrador que el resto.

## Qué se construye

1. **Rol en el sistema**: se agrega "Property Advisor" a la lista de roles, con su etiqueta y color propio en la administración de usuarios (crear, editar, aprobar, asignar país).
2. **Acceso a las mismas vistas**: las pantallas del receptor (Hoy, Agenda, Inspecciones, Perfil, detalle y secciones) quedan disponibles para el nuevo rol, con el mismo diseño móvil. Al iniciar sesión, el advisor entra directo a esa vista.
3. **Filtro por tipo**: en todas sus listas, agenda y contadores solo se incluyen inspecciones de check-in.
4. **Asignación**: en la creación manual de inspecciones y en el detalle de Admin, el selector de responsable cambia según el tipo de inspección (check-in → advisors; captación/check-out → inspectores). La integración con HubSpot resuelve el responsable por correo y acepta advisors para check-in.
5. **Tableros Admin**: nuevo panel "Desempeño de Property Advisors" con las mismas métricas que el de inspectores pero acotado a check-in, y los filtros por responsable separan ambos roles.
6. **Enlaces compartidos**: los enlaces de inspección (por ejemplo desde Slack) redirigen al advisor a su propia vista.

## Detalles técnicos

- Migración: ampliar `profiles_role_check` con `property_advisor`.
- Las políticas RLS de `inspections`, `inspection_sections`, `inspection_field_values`, `inspection_photos`, `inspection_signatures` e `inspection_reviews` ya se basan en `inspector_id = auth.uid()`, no en el rol, por lo que funcionan sin cambios. Se agrega restricción por tipo: para un usuario con rol `property_advisor` la visibilidad se limita a `inspection_type = 'check_in'` (condición añadida a las políticas de inspector usando `get_user_role`), y para `inspector` se excluye `check_in`.
- `UserRole` en `src/lib/types.ts` suma `property_advisor`; `src/pages/Index.tsx` y `src/pages/InspectionRoleRedirect.tsx` redirigen a `/inspector`; `ProtectedRoute` de las rutas `/inspector/*` acepta ambos roles.
- Las consultas del receptor (`useInspectorInspections`, dashboard, agenda, "todas") filtran por tipo según el rol del perfil.
- `AdminUsers.tsx`: opción de rol, etiqueta, color; `admin-create-user` acepta el nuevo rol.
- `AdminInspectionDetail.tsx` y `CreateInspectionForm.tsx`: filtran candidatos por rol según `inspection_type`.
- Nuevo RPC `get_advisor_performance(p_market)` análogo a `get_inspector_performance`, y `AdvisorPerformancePanel.tsx` en el dashboard; `get_inspector_performance` excluye check-in.
- Política de `profiles` para ejecutivos/comercial incluye `property_advisor` para poder ver nombres.

## Fuera de alcance

- Cambios en el flujo de estados del check-in (se mantiene el actual).
- Notificaciones por correo o WhatsApp al advisor.
