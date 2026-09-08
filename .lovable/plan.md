# Selector global de país + consistencia visual de Inmuebles

## 1. Selector de país global (no por sección)

Hoy la barra superior de Admin y Ejecutivo solo tiene el botón para colapsar el menú (verificado en `AdminLayout` y `ExecutiveLayout`), y el país vive únicamente como dato de cada inspección y del perfil del usuario. No existe ningún control global.

Qué se construye:

- Un selector de país en la barra superior, visible en todas las pantallas de Admin y Ejecutivo (misma barra donde está el botón del menú, alineado a la derecha).
- Opciones: "Todos los países", Chile, México. Arranca en el país del perfil del usuario si lo tiene; si no, en "Todos".
- La elección se recuerda entre sesiones y entre pantallas: se mantiene al navegar y al recargar.
- Todas las pantallas con listados pasan a respetar ese país: Inmuebles, Inspecciones, Agenda, Dashboard y la cola del Ejecutivo. El filtro por país deja de existir dentro de la sección Inmuebles (queda solo el global).
- Los valores históricos de país guardados de forma inconsistente ("chile", "CL") se muestran siempre con la etiqueta correcta ("Chile").

## 2. Errores de padding y componentes en Inmuebles

Verificado: el resto de las secciones envuelve su contenido en un contenedor con margen interno y ancho máximo (`p-6 max-w-7xl space-y-6` en Inspecciones, Dashboard y Usuarios), y la sección Inmuebles no lo tiene — por eso el contenido queda pegado a los bordes y las tarjetas se cortan a la derecha.

Correcciones:

- Envolver Inmuebles (listado y detalle) en el mismo contenedor con margen y ancho máximo que el resto de la app.
- Volver a las tarjetas de indicadores estándar (`KpiCard`) que usan Dashboard e Inspecciones, en lugar del bloque de números propio que se había introducido; se eliminan los estilos ad-hoc.
- Barra de filtros con los mismos componentes y tamaños que Inspecciones: buscador con icono, selectores estándar y botón de limpiar.
- Filas de inmuebles con la misma densidad, tipografías y separaciones que las tarjetas de Inspecciones, usando solo tokens de color del sistema (sin colores propios).
- Revisar el detalle del inmueble (ficha, línea de tiempo y comparación) para que use las mismas tarjetas, encabezados y espaciados.

## 3. Filtro por momentos del inmueble

Se mantiene el filtro que permite ver inmuebles que tuvieron captación, check-in y/o check-out, pero implementado con los mismos controles de filtro que usa Inspecciones, y combinable (por ejemplo: con captación y con check-out).

## Detalles técnicos

- Nuevo `src/contexts/MarketContext.tsx`: proveedor con `market` ('all' | 'CL' | 'MX'), `setMarket`, persistencia en `localStorage`, inicialización desde `profile.market`. Se monta en `App.tsx` dentro del árbol de `AuthProvider`.
- Nuevo `src/components/MarketSwitcher.tsx` (Select de shadcn, `size sm`), insertado en el `header` de `AdminLayout` y `ExecutiveLayout` con `ml-auto`.
- `src/lib/markets.ts`: se conserva `normalizeMarket` ya agregado; se reutiliza en todos los filtros y etiquetas.
- Aplicación del filtro global en memoria sobre los datos ya cargados (`normalizeMarket(i.market) === market`) en `PropertiesList`, `AdminInspections`, `AdminDashboard`, `AdminSchedule`, `ExecutiveReviewQueue` y `ExecutiveSchedule`; sin cambios de consultas ni de esquema.
- `src/pages/properties/PropertiesList.tsx`: quitar el `Select` de país y el bloque `Stat` local, restaurar `KpiCard` en grilla `grid-cols-2 lg:grid-cols-4 gap-4`, envolver en `div className="p-6 max-w-7xl space-y-6"`, filtros con el patrón de `AdminInspections`.
- `src/pages/properties/PropertyDetail.tsx`, `PropertyTimeline.tsx`, `PropertyComparison.tsx`: mismo contenedor, tarjetas y tokens; eliminar clases de color no semánticas si aparecen.
- Sin migraciones de base de datos.
