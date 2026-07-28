## Contexto

Los roles hoy viven en `profiles.role` con enum TS `UserRole = 'admin' | 'inspector' | 'executive' | 'pending'` y `ProtectedRoute` valida por `allowedRoles`. Agregar un rol nuevo es viable y no rompe lo existente.

Con tu aclaración, el rol comercial **no** necesita dashboards, KPIs, ni agenda: solo debe **listar, ver y descargar los Check-Out ejecutados** (recepciones), tal como un inspector ve su check-out ya enviado — con hallazgos, descripciones, fotos y firmas — pero sin poder editar nada.

Nombre propuesto: **`comercial`**.

---

## Alcance del rol Comercial (solo lectura + descarga)

**Puede:**
- Ingresar a Homie Inspection con su cuenta aprobada.
- Ver un listado de **Check-Outs ejecutados** (inspecciones tipo `check_out` con estado ≥ `submitted`: en revisión, aprobadas, publicadas, aceptadas).
- Abrir el detalle read-only de un check-out con toda la información capturada por el inspector: propiedad, hallazgos por sección, descripciones/observaciones, fotos (con zoom) y firmas.
- **Descargar** el check-out en PDF.

**No puede:**
- Ver captaciones, inspecciones no enviadas, ni presupuestos internos.
- Ver dashboards, agenda, catálogo, usuarios, integraciones, ni ninguna otra sección.
- Editar, aprobar, publicar, comentar, asignar, reabrir, subir/borrar fotos, ni tocar firmas.
- Ver costos internos de contratista ni notas internas del equipo.

---

## Pantallas y menú

Espacio propio bajo `/comercial/*`, layout minimalista sin sidebar (solo header con logo, nombre de usuario y logout). Dos pantallas:

### 1. Listado de Check-Outs ejecutados (`/comercial`)
- Título: **"Check-Outs ejecutados"**.
- Búsqueda tokenizada acento-insensible (misma librería que Admin/Ejecutivo) sobre dirección, torre, unidad, propietario/inquilino, ejecutivo, inspector.
- Filtros: mercado (CL/MX), estado (En revisión, Aprobada, Publicada, Aceptada), rango de fecha de inspección.
- Tabla/tarjetas con: dirección + unidad, tipo (chip Check-out), estado, fecha de inspección, ejecutivo, inspector.
- Solo lista `inspection_type = 'check_out'` con `status in (submitted, in_review, approved, published, accepted)`.
- Click → detalle read-only.

### 2. Detalle de Check-Out (`/comercial/check-out/:id`)
Vista read-only inspirada en cómo el inspector ve un check-out ya enviado. Estructura:

- **Header**: dirección completa, tipo (chip "Check-out"), estado, fecha de inspección, ejecutivo e inspector asignados, botón **"Descargar PDF"**.
- **Resumen de la propiedad**: datos del snapshot efectivo (tipo, dormitorios, baños, estacionamiento/bodega, torre, unidad, contacto).
- **Hallazgos por sección** (recorre las secciones operativas en su orden):
  - Nombre de la sección.
  - Campos y valores capturados (respuestas de checklist, textos, selects, matrices).
  - Observación final del inspector/ejecutivo.
  - Galería de fotos con lightbox + zoom (reusar `ZoomableImage` del ejecutivo) y caption.
- **Firmas**: firma del inspector y del inquilino (con nombre, fecha y estado: firmada / rehusada / no disponible).
- **Sin panel de presupuesto ni de feedback del propietario** (esos son procesos internos posteriores).

### Descarga PDF
- Botón **"Descargar PDF"** en el header del detalle y como acción por fila en el listado.
- Genera un PDF con la misma información visible en pantalla: portada con datos de la propiedad, secciones con hallazgos y fotos embebidas, firmas al final.
- Se aprovecha la infraestructura existente de reporte (misma normalización de datos usada por `get_published_report`), pero orientado al **Check-Out ejecutado**, no al reporte del propietario.

---

## Redirecciones y guardas

- Login redirige a `/comercial` cuando `role === 'comercial'`.
- `ProtectedRoute` acepta `'comercial'` como rol válido; rutas `/admin/*`, `/executive/*`, `/inspector/*` siguen bloqueadas.
- Ruta compartida `/inspections/:id` (Slack): si el usuario es comercial y la inspección es un check-out enviado, redirige a `/comercial/check-out/:id`; si no cumple las condiciones, muestra "No disponible".

---

## Cambios técnicos (referencia)

1. **Base de datos**
   - Agregar `'comercial'` al conjunto de roles válidos (`profiles.role`).
   - Nuevas RLS `SELECT` para `comercial` en: `inspections` (filtradas a `inspection_type='check_out'` y `status in (submitted,in_review,approved,published,accepted)`), `inspection_sections`, `inspection_field_values`, `inspection_photos`, `inspection_signatures`, y lectura mínima de `profiles` (nombre + rol) para mostrar ejecutivo/inspector.
   - **Sin** acceso a `inspection_repair_items`, `repair_catalog_items`, `inspection_reviews` (notas internas), `owner_feedback`, `inspection_audit_log`, integraciones, ni catálogo.
   - Ningún `INSERT/UPDATE/DELETE` para `comercial` en ninguna tabla.

2. **Frontend**
   - `src/lib/types.ts`: extender `UserRole` con `'comercial'`.
   - `src/App.tsx`: rutas `/comercial` y `/comercial/check-out/:id` con `ProtectedRoute allowedRoles={['comercial']}`.
   - `src/components/ProtectedRoute.tsx`: incluir `comercial` en el flujo de aprobación.
   - `src/pages/InspectionRoleRedirect.tsx`: rama comercial → `/comercial/check-out/:id` si el check-out ya fue enviado.
   - Nuevas páginas:
     - `src/pages/comercial/ComercialLayout.tsx` (header simple, sin sidebar).
     - `src/pages/comercial/ComercialCheckOutList.tsx`.
     - `src/pages/comercial/ComercialCheckOutDetail.tsx` (reutiliza `PhotoPanel`/`ZoomableImage` en modo read-only, sin acciones).
     - `src/lib/comercial-checkout-pdf.ts` (armado del PDF a partir del payload normalizado).
   - En páginas reutilizadas se pasa `readOnly` para ocultar cualquier CTA de edición.

3. **Gestión de usuarios (Admin)**
   - En `AdminUsers.tsx`, añadir `Comercial` como opción al asignar rol, con el mismo flujo de aprobación existente.

4. **Auditoría**
   - Assert defensivo en Edge Functions críticas (`publish_inspection`, `approve_inspection`, `executive_force_close_owner_feedback`, `hubspot-*`) para rechazar `role === 'comercial'` si llegara a invocarlas.

---

## Fuera de alcance

- Captaciones, dashboards, agenda, catálogo, presupuestos, feedback del propietario y cualquier otro módulo.
- Segmentación por mercado/cartera dentro del rol comercial (por defecto ve todos los check-outs enviados; agregable después si se necesita).
- Exportaciones masivas (CSV/Excel) — se puede agregar más adelante si el equipo lo pide.
