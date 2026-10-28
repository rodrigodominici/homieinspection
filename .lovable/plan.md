# Mejoras de cotizaciones

## Estado y alcance
Plan retomado para revisión. Los cinco requerimientos son viables; la primera etapa propuesta es **«Por cotizar»**, siguiendo el orden elegido anteriormente. Esta revisión no modifica la aplicación.

## Etapas

| Orden | Mejora | Alcance | Complejidad y principal riesgo |
|---|---|---|---|
| 1 | Por cotizar | Permitir agregar trabajos cuyo precio todavía no esté definido. | Baja a media: distinguir un precio pendiente de un trabajo gratuito en totales, aprobación e informes. |
| 2 | Historial de cotizaciones | Conservar la cotización inicial y sus modificaciones, con fecha, responsable y decisiones del inversionista; consulta y descarga para usuarios internos de Homie. | Media: preservar versiones sin alterar lo que ya fue enviado o aprobado y mantener los límites de acceso a datos personales. |
| 3 | Proveedor externo | Dar acceso puntual a una OT mediante un enlace individual. | Media: el enlace debe ser limitado a esa OT, revocable y con vencimiento; no un acceso compartido a todas las órdenes. |
| 4 | Modificar cotización con OT generada | Reemplazar, modificar o retirar partidas y reflejar los cambios en la OT, conservando importes y trazabilidad. | Alta: proteger trabajos ya ejecutados, evitar cambios silenciosos sobre montos aprobados y coordinar al contratista. |
| 5 | Cotizaciones adicionales | Crear cotizaciones independientes después de enviar o aprobar la inicial, sin reemplazarla; asignarlas al mismo contratista o a uno diferente. | Alta: separar partidas, aprobaciones, totales y órdenes de trabajo de cada cotización. |

## Primera etapa: «Por cotizar»

### Experiencia propuesta
- El ejecutivo puede agregar una partida con descripción, sección y cantidad, indicando que su precio está pendiente.
- La partida muestra **«Por cotizar»**, no un importe de $0 que pueda interpretarse como gratuito.
- Al definir su precio, pasa a ser una partida cotizada y sigue el proceso habitual de aprobación.

### Reglas propuestas para aprobar
Estas reglas son propuestas del plan anterior, no decisiones ya implementadas:
- Las partidas pendientes son visibles para el inversionista en el informe y la descarga, pero no se pueden aprobar ni rechazar hasta tener precio.
- No se incluyen en el total cotizado; se informa cuántas partidas quedan pendientes.
- No pasan a la OT mientras no tengan precio. Las demás partidas pueden continuar su flujo habitual.
- Completar el precio no implica aprobación automática ni incorporación automática a una OT existente.

### Validación
Probar una cotización mixta con partidas cotizadas y pendientes: verificar totales, informe, descarga, respuesta del inversionista y generación de OT. Probar también que definir el precio recupera el flujo normal sin otorgar aprobación automática.

## Decisiones pendientes para las siguientes etapas
- **Cambios después de generar la OT:** cuándo requieren nueva aprobación y cómo tratar trabajos iniciados o completados.
- **Historial:** formato de descarga y alcance de consulta de cada perfil interno, sin ampliar acceso a información ajena a las cotizaciones.
- **Proveedores externos:** vigencia del enlace y acciones permitidas.
- **Cotizaciones adicionales:** relación entre cada cotización y sus OT. La creación posterior al envío o aprobación de la inicial está definida; no se asume que cerrar una OT las genere automáticamente.

## Detalles técnicos
- Antes de implementar, verificar el estado actual de partidas, versiones de informes, aprobaciones y OT; reutilizar lo que ya existe.
- Representar el precio pendiente con un estado explícito, no inferirlo de un importe cero.
- Aplicar la misma regla en edición, totales, informes públicos, descargas y generación de OT, con pruebas específicas.
- Mantener versiones enviadas y aprobadas como registros históricos; las modificaciones posteriores deben ser trazables.

## Fuera de la primera etapa
Historial nuevo, acceso de proveedores externos, edición de OT y cotizaciones adicionales se implementarán por separado. El chat para administradores continúa en pausa.