# Ejecutivos ven partidas duplicadas (Chile + México)

## Qué pasa
Sí, se debe a la copia del catálogo a México. Ahora hay 128 partidas activas de Chile y 128 de México, con los mismos nombres. Las de México tienen precio $0. La corrección que filtra por país ya está hecha en la versión de prueba, pero **todavía no está publicada**. Por eso, los ejecutivos que usan la app publicada siguen viendo las dos copias.

Revisé las 301 inspecciones y todas tienen país (293 de Chile y 8 de México). El filtro va a funcionar en todas.

## Qué haremos
1. **Reforzar el filtro:** el buscador de partidas de la cotización mostrará solo las partidas del país de la inspección. Si una inspección no tuviera país, no se mostrará ninguna partida, en vez de mostrar todas mezcladas.
2. **Catálogo del ejecutivo** (menú Catálogo): mostrará solo las partidas de los países del ejecutivo. Para los ejecutivos de Chile, solo las de Chile.
3. **Probarlo en pantalla** con un ejecutivo de Chile: buscaremos "sello" y confirmaremos que cada partida aparece una sola vez y con su precio.
4. **Publicar** para que los ejecutivos vean el cambio.

## Detalles técnicos
- En `fetchActiveCatalog(market)` de `repairs.service.ts`, se filtrará en la consulta con `.eq('market', normalizeMarket(market))`. Si no hay país, devolverá una lista vacía en vez de `all`.
- En `ExecutiveRepairCatalog.tsx`, se confirmará que usa `matchesMarket` y que excluye las partidas sin país.
