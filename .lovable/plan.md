# Arreglar el buscador de partidas vacío en la cotización

## Qué pasa

Lo causó el cambio de ayer para que los ejecutivos no vieran las partidas de Chile y México mezcladas. Las partidas están bien en la base de datos: 128 activas de Chile y 128 de México, y los ejecutivos tienen permiso para verlas.

El problema está en la pantalla de cotización. Al abrirse, guarda el buscador de partidas antes de terminar de cargar los datos de la inspección. Por eso, cuando el ejecutivo abre el catálogo, la app cree que la inspección no tiene país. Y como ayer cambiamos la regla a "sin país no se muestra nada" (para no mezclar países), el buscador aparece vacío siempre. Antes del cambio, en esa misma situación se mostraban todas las partidas, y por eso no se notaba.

## Qué vamos a hacer

1. Hacer que el buscador use el país de la inspección ya cargado, para que muestre las partidas de Chile en las inspecciones de Chile y las de México en las de México.
2. Si la inspección todavía se está cargando, esperar a tener el país antes de abrir el catálogo, en vez de mostrar una lista vacía.
3. Probarlo en pantalla con una ejecutiva de Chile: buscar "puerta" y confirmar que aparecen las partidas con su precio, una sola vez cada una.
4. Publicar para que los ejecutivos lo tengan hoy.

## Detalles técnicos

- `src/modules/review/api/useReviewActions.ts`, `openCatalog`: el `useCallback` tiene solo `[toast]` como dependencias, así que conserva `inspection` de la primera carga (undefined). Agregar `inspection?.market` a las dependencias. Si `market` todavía es null, mostrar un aviso de "cargando" en vez de abrir el catálogo con una lista vacía.
- Sin cambios de base de datos ni de permisos.
