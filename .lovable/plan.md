## Objetivo
Permitir a los ejecutivos hacer zoom sobre las fotos directamente dentro del lightbox del workstation de revisión, sin descargar la imagen.

## Alcance
Solo se modifica el visor de fotos ejecutivo: `src/pages/executive/review-detail/PhotoPanel.tsx` (el `Dialog` lightbox que ya existe).

No se toca el visor del inspector, el reporte público del propietario, ni la lógica de carga/almacenamiento de fotos.

## Comportamiento

Dentro del lightbox de una foto:

- **Zoom con rueda del mouse**: scroll adelante = acerca, scroll atrás = aleja. Zoom centrado en la posición del cursor.
- **Doble click**: alterna entre 1x y 2.5x en el punto donde se hizo click.
- **Arrastrar (drag)** cuando la escala es > 1x: mueve la imagen (pan). El cursor cambia a `grab` / `grabbing`.
- **Controles visibles** en la esquina inferior derecha del lightbox:
  - Botón `−` (alejar)
  - Indicador de escala actual (ej. "150%")
  - Botón `+` (acercar)
  - Botón "Reset" (vuelve a 100% y centrado)
- **Atajos de teclado** dentro del lightbox:
  - `+` / `=` acerca
  - `−` acerca al revés
  - `0` reset
  - Flechas ← / → siguen navegando entre fotos (se preserva el comportamiento existente).
- **Límites**: escala mínima 1x, máxima 5x. Al navegar a otra foto (prev/next) se resetea la escala a 1x.
- **Botones de navegación** prev/next solo se muestran cuando la escala es 1x, para que el drag de pan no compita con ellos.

## Detalles técnicos

En `PhotoPanel.tsx`:

1. Añadir estado local dentro del `Dialog`: `{ scale, offsetX, offsetY, dragging }`. Envolver el `<img>` del lightbox en un contenedor con `overflow-hidden` y aplicar `transform: translate(x,y) scale(s)` sobre el `<img>`.
2. Handlers en el contenedor: `onWheel` (con `e.preventDefault` + zoom hacia el cursor recalculando offsets), `onDoubleClick`, `onPointerDown` / `onPointerMove` / `onPointerUp` para pan (usar `setPointerCapture`).
3. `useEffect` que resetea `{scale:1, offsetX:0, offsetY:0}` cuando cambia `lightboxIdx` o cuando el diálogo se cierra.
4. Listener de teclado (solo activo mientras el lightbox está abierto) para `+`, `-`, `0`. Las flechas siguen manejadas por los botones existentes.
5. Ocultar los botones `ChevronLeft`/`ChevronRight` cuando `scale > 1` para evitar que interfieran con el pan.
6. Sin dependencias nuevas — todo se resuelve con estado local y CSS transforms.

## Verificación
- Typecheck (`tsgo`) limpio.
- Prueba manual en el workstation ejecutivo: abrir una foto, hacer scroll para zoom, arrastrar para pan, doble click, botones +/−/reset, navegar entre fotos y confirmar reset.
