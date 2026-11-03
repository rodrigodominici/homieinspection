# Cambios de cotización con OT creada

## Alcance
Permitir agregar, reemplazar, modificar o retirar partidas pendientes de ejecución cuando ya existe una orden de trabajo, conservando el historial de cotizaciones, montos y trabajos registrados. Aplica a check-out y captación en ambos países, con los permisos actuales de administradores y ejecutivos.

## Reglas acordadas
- Las partidas nuevas o modificadas requieren una nueva aprobación del inversionista antes de aplicarse a la OT.
- Las partidas sin cambios conservan su autorización y pueden continuar ejecutándose.
- Las partidas que el contratista ya marcó como terminadas no se pueden modificar ni eliminar. Un reemplazo se registra como una partida nueva.
- Las partidas «Por cotizar» siguen fuera de montos, decisiones y OTs hasta tener un precio definido.
- No se crean cotizaciones adicionales ni accesos para proveedores externos en esta etapa.

## Flujo propuesto
1. El ejecutivo abre **Modificar cotización** y prepara una revisión separada de la OT vigente, con motivo obligatorio.
2. La pantalla muestra partidas agregadas, modificadas o retiradas y la diferencia de montos. Los trabajos terminados se muestran bloqueados.
3. Al enviar la revisión, se conserva la versión anterior y se solicitan decisiones solo sobre los cambios. Una retirada también requiere autorización.
4. Mientras espera respuesta, el contratista sigue viendo la OT vigente, pero las partidas afectadas quedan pausadas para evitar ejecutar un trabajo que se está reemplazando o retirando.
5. Los cambios aceptados se aplican a la misma OT de forma controlada; los rechazados no sustituyen las partidas anteriores. Cada partida muestra su situación y queda registro del resultado.
6. La OT muestra la actualización y conserva fotos, comentarios, costos reales y estados de las partidas que no cambiaron. No se reabre automáticamente una OT cerrada.

## Trazabilidad
- Registrar motivo, fecha, autor, valores anteriores y nuevos, decisión del inversionista y fecha de aplicación a la OT.
- Consultar las versiones enviadas y descargar sus PDFs desde el historial existente.
- No reconstruir aprobaciones o costos históricos que no hayan quedado registrados.

## Detalles técnicos
- Introducir un borrador de revisión y cambios por partida, separado de las filas operativas vigentes; capturar el estado y los montos base de la OT.
- Aplicar las transiciones en operaciones transaccionales del servidor con validación de usuario, mercado, versión vigente y estado de cada trabajo.
- Proteger todas las vías de edición, borrado, asignación y respuesta para que no puedan saltarse la aprobación ni modificar trabajos terminados mediante solicitudes directas.
- Integrar decisiones de cambios con el informe público sin mover respuestas de versiones anteriores ni solicitar otra vez la aprobación de partidas intactas.
- Detectar conflictos: si una partida fue terminada mientras se preparaba la revisión, impedir aplicar ese cambio y pedir actualizar el borrador.
- Conservar la OT y la identidad de sus partidas; archivar las retiradas autorizadas en lugar de borrar evidencia.

## Verificación
- Probar modificaciones de cantidad, precio, pagador, reemplazos y retiros con OT abierta.
- Verificar aceptación y rechazo parciales, pausa de partidas afectadas y continuidad de las intactas.
- Comprobar bloqueo de trabajos terminados, versiones desactualizadas y usuarios sin permiso.
- Recorrer el flujo completo con ejecutivo, inversionista y contratista; confirmar lectura posterior, historial y PDF.
- Mantener los cambios sin publicar hasta finalizar la prueba de Operaciones.