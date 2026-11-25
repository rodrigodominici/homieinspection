# Vista comercial para México + filtro por Customer Success

## Qué se construye
1. **Vista comercial disponible en México**: la misma pantalla de check-outs y captaciones que hoy usa Comercial en Chile, mostrando las inspecciones del mercado del usuario (CL o MX).
2. **Filtro «Customer Success»** en esa vista (Chile y México): un selector con los nombres de las ejecutivas, más la opción «Mis inspecciones», para que cada una vea solo las suyas.
3. **De dónde sale la ejecutiva de cada inspección (HubSpot)**:
   - México: «Propietario del ticket en pipeline Finalizaciones» (ticket).
   - Chile: «Ejecutiva(o) Customer Success» del Contrato de Arriendo.
   - Se guarda al recibir cada inspección nueva y se completa una vez para las inspecciones existentes.
4. Si la persona de HubSpot coincide por correo con un usuario de HI, el filtro «Mis inspecciones» funciona; si no, igual se muestra su nombre en el filtro.

## Detalles técnicos
- Nueva columna `inspections.customer_success_email` y `customer_success_name` (nullable), más `customer_success_profile_id` resuelto por email en `profiles`.
- Resolver los nombres internos de ambas propiedades consultando la API de propiedades de HubSpot (tickets para MX, objeto de contrato para CL); el owner ID se traduce a email/nombre con `/crm/v3/owners/{id}`.
- MX: buscar el ticket asociado al deal/propiedad en el pipeline «Finalizaciones»; tomar `hubspot_owner_id`.
- Enriquecimiento en la ingesta HubSpot (función de intake) + función de backfill one-off solo admin, con log en `hubspot_sync_log`.
- `ComercialCheckOutList`: filtro por mercado ya activo vía `useMarket`; agregar selector Customer Success persistido en sessionStorage, igual que los filtros de fecha.
- Habilitar rol `comercial` con mercado MX (usuarios y RLS existentes ya filtran por `user_has_market`; verificar `is_visible_checkout_for_comercial` para MX).
- Test: regla de selección de propiedad por mercado (MX → ticket Finalizaciones, CL → contrato).

## Supuesto a confirmar
- Los ejecutivos Customer Success de MX usarán una cuenta con rol Comercial (no Ejecutiva).
