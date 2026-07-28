## Objetivo

Que el inspector distinga a simple vista si una inspección asignada es **Captación** o **Check-out**, en todas las vistas donde hoy solo ve "una inspección asignada" sin tipo.

## Alcance (UI del rol Inspector)

Agregar un chip/badge de tipo de inspección junto al título/dirección en:

1. **Dashboard** (`src/pages/inspector/InspectorDashboard.tsx`) — cards de las secciones "Por coordinar", "Por iniciar" y "En progreso".
2. **Listado completo** (`src/pages/inspector/InspectorAllInspections.tsx`) — cada card de la lista.
3. **Calendario** (`src/pages/inspector/InspectorCalendar.tsx`) — items agendados del día/semana.
4. **Detalle de inspección** (`src/pages/inspector/InspectorInspectionDetail.tsx`) — header, junto al nombre de la propiedad.

## Diseño del chip

- Texto: `Captación` o `Check-out` (usando `getInspectionTypeLabel` que ya existe en `src/lib/inspection-type-labels.ts`).
- Tokens semánticos del design system (nada hardcoded):
  - Captación → tono `status-good` suave (fondo `bg-status-good/10`, texto `text-status-good`).
  - Check-out → tono neutro (fondo `bg-muted`, texto `text-foreground`).
- Tamaño consistente con badges existentes (`text-[10px]`/`text-xs`, `rounded-full`, `px-2 py-0.5`).
- Se ubica al lado del título de la propiedad (mobile-first, no rompe el layout de dos columnas título + estado).

## Implementación técnica

- Crear un componente pequeño reutilizable `InspectionTypeChip` en `src/components/inspector/InspectionTypeChip.tsx` que recibe `type: InspectionType` y usa los helpers existentes.
- Insertarlo en los 4 archivos listados. Sin cambios de negocio, sin tocar queries ni edge functions (el campo `inspection_type` ya viene en el payload usado por estas vistas).
- Sin cambios en BD.

## Fuera de alcance

- No se toca la vista Admin/Ejecutivo (ya muestran el tipo).
- No se cambia lógica de filtrado ni ordenamiento por tipo (se puede evaluar en un siguiente paso si lo piden).
