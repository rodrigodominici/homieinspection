# Módulo de Comunicaciones: envío automático del informe de check-in al inquilino

Al finalizar un check-in, el inquilino recibe automáticamente un correo con el enlace a su informe. Todo lo enviado queda registrado en una bitácora visible para Admin.

## Requisito previo: dominio de envío

Los correos saldrán desde **homierent.com**. Hoy el proyecto no tiene dominio de envío configurado, así que el primer paso es darlo de alta y verificarlo (se agregan unos registros en el proveedor de DNS del dominio). Mientras la verificación esté pendiente se puede construir todo lo demás; los correos empiezan a salir al verificarse.

## Qué verá el inquilino

1. Correo de "Informe de entrega de tu departamento", con el nombre del inmueble y la fecha de entrega.
2. Un botón que lleva a la página web del informe en la app (enlace público con token, sin necesidad de contraseña).
3. Dentro de esa página, el inquilino puede ver el informe y descargar el PDF.

Si el inmueble no tiene correo del inquilino registrado, no se envía nada y queda marcado como "sin destinatario" en la bitácora para que Operaciones lo complete.

## Qué verá el equipo (módulo de Comunicaciones)

- Nueva sección **Comunicaciones** en Admin con la bitácora de correos: fecha, destinatario, tipo de correo, inmueble/inspección, estado (enviado, sin destinatario, falló, rebotado) y motivo cuando falla.
- Filtros por país, tipo de correo, estado y rango de fechas; búsqueda por inmueble o correo.
- En la ficha de la inspección de check-in: bloque "Comunicaciones" con lo enviado a ese inquilino y botón **Reenviar informe** (con confirmación) por si el correo se perdió o cambió el destinatario.
- Los rebotes y las bajas de suscripción quedan reflejados en la bitácora; una dirección dada de baja deja de recibir correos.

## Flujo

```text
Check-in finalizado
        |
        v
Se genera el informe (PDF + enlace público del inquilino)
        |
        v
Se pide el envío del correo  ---> sin correo del inquilino ---> registro "sin destinatario"
        |
        v
Correo enviado --> registro "enviado"  (reintentos automáticos si hay fallo temporal)
```

## Detalles técnicos

**Infraestructura de correo**
- Alta y verificación del dominio de envío `homierent.com` (subdominio delegado para envío).
- Infraestructura de correos del proyecto: colas, log de envíos, supresión y tokens de baja; función de envío única con plantillas React Email y página de baja de suscripción dentro de la app.
- Plantilla `checkin-report-ready.tsx` en el registro de plantillas, con paleta Homie (indigo #525EA2), tipografía y CTA consistentes con el informe público.

**Módulo de comunicaciones (app)**
- Nuevo módulo `src/modules/communications/` con `api/communications.service.ts` (lecturas de la bitácora sobre `email_send_log` + join a inspecciones) y hooks react-query.
- Nueva página `src/pages/admin/AdminCommunications.tsx` + ruta en `src/App.tsx` y entrada en `AdminLayout`, con `DataTable`, `FiltersBar`, `StatusBadge` y filtrado por `MarketContext`.
- Componente `CommunicationsPanel` reutilizado en `AdminInspectionDetail.tsx` y `ExecutiveReviewDetail.tsx` con acción de reenvío.
- Columna de contexto para la bitácora: se añade `inspection_id` (nullable) a `email_send_log` mediante migración, más índice; sin tocar el resto del contrato de la tabla.

**Disparo automático**
- Edge Function nueva `send-checkin-report-email`: valida JWT, resuelve la inspección, verifica que sea `check_in` y esté finalizada, obtiene el `public_token` de la versión publicada con `audience = 'tenant'`, resuelve el correo del inquilino desde el snapshot efectivo (`recipient_email` / `tenant_email`) e invoca la función de envío con `idempotencyKey = checkin-report-{inspection_id}-v{version}`.
- Se invoca desde el cierre del check-in (`finalize`/publicación en `src/modules/review/api/inspection-actions.service.ts` y `useReviewActions.ts`), después de generar el PDF y las versiones; un fallo de correo no revierte el cierre, queda registrado y reintentable.
- El PDF se sigue generando en el navegador y se guarda en `inspection-reports`; el correo no adjunta archivos (no soportado), enlaza a la página pública del informe.

**Página pública del informe del inquilino**
- Se verifica que la ruta pública del informe sirva `audience = 'tenant'` vía `get_published_report`; si falta, se agrega la variante de inquilino (solo lectura, sin precios ni datos internos) con botón de descarga del PDF por URL firmada de corta duración.

## Fuera de alcance

- Envío de correos para check-out y captación (el módulo queda preparado para sumarlos).
- Campañas, recordatorios masivos o cualquier correo de marketing.
- Notificaciones por WhatsApp o SMS.
