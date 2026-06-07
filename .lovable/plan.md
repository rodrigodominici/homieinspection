## Problema

En `src/pages/Auth.tsx`, el panel izquierdo (desktop) y el header móvil usan `bg-[hsl(var(--sidebar-background))]` con texto `text-white` y `text-white/60`. Anteriormente el sidebar era oscuro, pero el DS canónico de Homie redefinió `--sidebar-background` a blanco (`0 0% 100%`), por lo que ahora hay texto blanco sobre fondo blanco — el título "Homie Inspection" y el subtítulo prácticamente desaparecen.

## Solución

Cambiar el panel de branding para usar la marca Homie Indigo como superficie oscura, en lugar de depender del token de sidebar:

1. **Panel desktop izquierdo** (`Auth.tsx`):
   - Fondo: `bg-primary` (Homie Indigo #525EA2) en lugar de `bg-[hsl(var(--sidebar-background))]`.
   - Gradiente decorativo: cambiar `from-primary/20` a algo que sume contraste sobre indigo (ej. `from-white/10 to-transparent`) para mantener el efecto sutil sin lavar el fondo.
   - Logo container: pasar de `bg-primary` a `bg-white/10` con borde sutil (`border border-white/20`) para que destaque sobre el fondo indigo.
   - Texto: `text-primary-foreground` para el título y `text-primary-foreground/70` para el subtítulo (tokens semánticos, contraste AA garantizado).

2. **Header móvil**:
   - Mismo tratamiento: `bg-primary`, logo en `bg-white/10`, texto en `text-primary-foreground`.

3. **Verificación**: tomar screenshot del preview en `/auth` (desktop y móvil) después de aplicar y confirmar que el copy es legible.

Sin cambios a tokens globales ni al panel derecho del formulario.

## Archivos

- `src/pages/Auth.tsx` — único archivo editado.
