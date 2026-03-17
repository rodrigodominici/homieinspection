

# Plan: Admin Generation Rules Visibility Panel

## What to build

A new read-only page at `/admin/generation-rules` that displays the current hardcoded generation logic from `inspection-generator.ts` in a structured, scannable admin panel with grouped cards.

## Implementation

### 1. Create `src/pages/admin/AdminGenerationRules.tsx`

A static, read-only page with four card groups:

**Fixed Sections** — table listing the 9 always-included sections (Datos de propiedad, Persona que entrega, Acceso, Cocina, Electrodomésticos, Aseo, Llaves, Medidores, Info Adicional)

**Repeatable Sections** — two items: Dormitorios (driven by `bedrooms_count`) and Baños (driven by `bathrooms_count`), each showing the repeat logic

**Conditional Sections** — table with columns: Section name, Condition, showing each flag-based rule (Terraza Living, Terraza Dormitorio, Walking Closet, Logia, Bodega y Estacionamiento, Antejardín)

**Property-Based Rules** — the Living section rule: Estudio → Living/Dormitorio, otherwise → Living/Comedor

Each group is a Card. At the top, an info banner explains these rules are hardcoded for the MVP and will evolve into editable templates.

### 2. Add route and navigation

- Add `/admin/generation-rules` route in `App.tsx`
- Add a "Reglas" nav button in `AdminDashboard.tsx` header alongside the existing Usuarios/Mappings/Templates links
- Use a `Settings` or `BookOpen` icon from lucide-react

### 3. Files changed

| File | Change |
|---|---|
| `src/pages/admin/AdminGenerationRules.tsx` | New file — the read-only rules panel |
| `src/App.tsx` | Add route + import |
| `src/pages/admin/AdminDashboard.tsx` | Add nav link in header |

No database changes. No logic changes. Pure UI addition.

