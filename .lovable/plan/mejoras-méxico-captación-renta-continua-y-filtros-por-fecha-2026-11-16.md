# Mejoras México: captación (renta continua) y filtros por fecha

Orden: primero el error crítico, porque bloquea Check-out.

## 1. Error al finalizar captación MX (crítico, ocurre en todas)
- Reproducir el cierre de una captación MX de prueba con un usuario receptor y con uno ejecutivo, y capturar el error real. No hay errores registrados en los últimos 14 días, así que todavía no está confirmada la causa.
- Corregir la causa y asegurar que la ventana de error siempre se pueda cerrar.
- Registrar este tipo de fallas para detectarlas a futuro.
- Prueba completa con una captación de prueba hasta «Finalizado». Después se borra.

## 2. Renta continua (por ahora todas las captaciones MX)
- **Sin aprobación del propietario en MX:** al publicar, la captación no pide aprobación. La aprueba Homie y el proceso sigue directo. Chile no cambia.
- **Link solo con el Informe de hallazgos:** el enlace para el propietario muestra únicamente el informe, sin cotización ni decisiones. Internamente se sigue viendo todo.

## 3. Fecha de creación → HubSpot
- Al crear la captación MX en HI, se envía su fecha de creación a «Fecha de recepción de form» del negocio en el pipeline RC Tarjeta de Mtto: Evaluación.
- Antes de programarlo, verificar en HubSpot el nombre exacto de esa propiedad.
- También se corrigen las captaciones existentes que no la tengan.

## 4. Filtro y orden por fecha (captación, check-in, check-out, todos los estados)
- Rangos: Hoy, Esta semana, Este mes, Personalizado y Todas.
- Selector del tipo de fecha: programada, creación o recolección de llaves.
- Orden ascendente o descendente.
- Se guarda mientras se navega. Así, «Por coordinar» deja de mezclar meses.

## 5. Terminología
- En pantallas, «Inspector» pasa a decir «Receptor». El nombre «Inspector» queda reservado para quien revisa la calidad cuando el contratista termina. Ese rol nuevo no se crea en esta etapa.

## Fuera de alcance
- Check-out MX (sección 2.2 vacía): se activa recién después del punto 1.
- Fechas de Chile.

## Detalles técnicos
- Punto 1: revisar `finalize_inspection` y el flujo de cierre del receptor y del ejecutivo, sobre todo los bloqueos `work_not_done` y las firmas.
- Punto 2: condición por mercado MX en el flujo de publicación y aprobación del propietario. En el enlace público, la audiencia «solo hallazgos» filtra lo que devuelve `get_published_report`.
- Punto 3: propiedad nueva en el resolver de propiedades de HubSpot (acción create, captación MX), con test.
- Punto 4: filtro del lado del cliente o en la consulta de las listas de admin, ejecutivo y receptor, con un hook compartido.
- Tests por regla: MX sin aprobación, CL con aprobación y fecha de creación mapeada.
