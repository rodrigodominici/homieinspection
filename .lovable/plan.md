# Asistente de consultas para admins (HI + HubSpot)

## Qué se construye
Una nueva página **"Asistente"** en el panel de admin. Ahí un admin hace preguntas en lenguaje simple, por ejemplo: "¿por qué el contrato 61527264411 tiene fecha de check-out?" o "¿qué se envió a HubSpot desde Curiñanca 715?". El asistente busca en Homie Inspection y en HubSpot y responde explicando qué pasó.

- **Solo consulta:** no puede cambiar nada, ni en la app ni en HubSpot.
- **Solo admins:** otros roles no ven la página ni pueden usarla.
- **Conversaciones guardadas:** cada admin tiene su lista de chats, puede crear uno nuevo y retomar los anteriores. Cada admin ve solo sus propios chats.
- Mientras responde, muestra qué está revisando (por ejemplo "Buscando inspección…", "Leyendo contrato en HubSpot…"), en pasos que se pueden desplegar.

## Qué puede consultar
En Homie Inspection:
- Inspecciones: buscar por dirección, ID de propiedad, ID de HubSpot o persona asignada. Ver su estado, tipo, país y fechas.
- Historial de una inspección: cambios de estado y quién los hizo.
- Envíos a HubSpot: qué se mandó, cuándo, a qué campo, y si HubSpot lo aceptó.
- Vínculos de la inspección con HubSpot (contrato o negocio).
- Avisos recibidos desde HubSpot que crearon inspecciones.

En HubSpot (solo lectura):
- Leer un contrato de arriendo o un negocio por su ID.
- Ver el historial de cambios de un campo (por ejemplo, quién puso una fecha y cuándo).

## Límites
- Las respuestas dependen de lo que el asistente encuentre; si no encuentra un dato, debe decirlo y no inventarlo.
- Cada pregunta consume créditos de IA del espacio de trabajo.
- Para corregir datos se sigue usando este chat de desarrollo.

## Detalles técnicos
- Base de datos: tablas `assistant_threads` (id, user_id, title, timestamps) y `assistant_messages` (id uuid generado, thread_id, ui_message_id text, role, parts jsonb, created_at), con GRANTs y RLS que limitan cada fila a su dueño y además a `has_role(auth.uid(),'admin')`.
- Función del servidor `admin-assistant`: valida la sesión y que el usuario sea admin, verifica que el chat le pertenezca, y transmite la respuesta con AI SDK sobre Lovable AI Gateway (`openai/gpt-6-astra`, Responses API, razonamiento `medium`). Guarda los mensajes al terminar (`onFinish`).
- Herramientas del modelo, todas de lectura y con parámetros validados (sin SQL libre): `search_inspections`, `get_inspection`, `get_inspection_audit_log`, `get_hubspot_sync_log`, `get_external_references`, `get_source_events`, `hubspot_get_record` (con propiedades e historial), `hubspot_get_property_history`. Las de HubSpot solo usan GET con el token privado que ya tiene la app (`HUBSPOT_PRIVATE_APP_TOKEN`).
- Interfaz con AI Elements: lista de chats + ruta `/admin/asistente/:threadId`, respuestas con formato, pasos de herramientas colapsados, campo de texto siempre enfocado. Entrada en el menú de admin, protegida para admin.
- Contexto del sistema: explica el modelo de HI (tipos check_in / check_out / captación, campos que se envían a HubSpot por país) para que las explicaciones sean correctas.
- Verificación: crear dos chats, preguntar por el caso de Curiñanca 715 en uno y por otro caso en el otro, recargar y confirmar que cada uno recupera sus mensajes.
