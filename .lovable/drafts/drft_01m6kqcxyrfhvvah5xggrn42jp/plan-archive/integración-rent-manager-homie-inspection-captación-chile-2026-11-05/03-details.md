## Claves y dirección
- Te abro el formulario para las dos claves (`RENT_MANAGER_INTAKE_SECRET` y `RENT_MANAGER_WEBHOOK_SECRET`). Ojo: las claves aplican a todo el proyecto.
- La dirección del webhook (`RENT_MANAGER_WEBHOOK_URL`) la cargamos cuando tengas el túnel.
- Hasta entonces, los envíos se prueban contra un receptor simulado dentro del borrador. Sin dirección configurada, los avisos quedan en espera y no se envía nada.

## Detalles técnicos
- **Parte 1:**
  - `validateEnvelope` acepta `rent_manager`.
  - La clave se valida según la fuente, en tiempo constante.
  - Se guarda el `source` recibido en eventos y referencias, con `provider=rent_manager`, `captacion` y `metadata.rm_inspection_id`.
  - `fecha_tentativa_recepcion` se usa como `scheduled_at`.
  - Se omite `enrichCaptacionUnit`.
  - Se corrigen `retry-source-event` y `recover-stalled-events`.
  - Se borran `rent-manager-captacion-intake` y `rent-manager-captacion-status`.
- **Parte 2:**
  - Tabla `rent_manager_outbox`: solo admins leen y `event_id` es único.
  - Triggers en la base sobre inspections, work orders, fotos y versiones de informe. Solo encolan si hay una referencia rent_manager activa.
  - Disponibilidad, mover fecha y «no en condiciones» se encolan dentro de las RPC del servidor que hacen esos cambios.
  - Mapeos de llaves y lockbox, montos enteros en CLP y URLs firmadas por 7 días.
  - `rent-manager-dispatch`:
    - timeout de 15 s y orden por inspección;
    - 200 = enviado;
    - 400, 401 o 404 = error sin reintento;
    - 5xx o falla de red = reintento a 1, 5 y 15 min, 1 h y luego cada 6 h;
    - un `sending` de más de 5 min vuelve a `pending`;
    - pg_cron cada minuto, más un aviso al encolar.
- **Parte 3:** columnas e historial de disponibilidad. «No en condiciones» cierra la inspección sin borrar nada y la duplica con una referencia nueva.
- Las migraciones quedan registradas en el borrador y llegan a la app solo al aceptarlo.
- Tests en `src/test`: los de la Parte 1 y la Parte 2 que pediste, más una prueba completa con el ejemplo del contrato.
