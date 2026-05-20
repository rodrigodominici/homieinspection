# Causa del filtro "Inspector" roto

El dropdown de inspectores solo muestra "Inspector sin nombre" y filtrar no surte efecto porque **el ejecutivo no puede leer la tabla `profiles`**.

## Diagnóstico

`ExecutiveReviewQueue` arma la lista de inspectores así:

```ts
inspectors = ids.map(id => ({
  id,
  name: inspectorProfiles[id]?.full_name ?? inspectorProfiles[id]?.email ?? 'Inspector sin nombre',
}));
```

`inspectorProfiles` viene de `useProfilesByIds(inspectorIds)` → `supabase.from('profiles').select('id, full_name, email, role').in('id', ids)`.

Las políticas RLS actuales sobre `public.profiles` son:

| Policy | Cmd | USING |
|---|---|---|
| Admins can view all profiles | SELECT | `has_role(uid,'admin')` |
| Users can view their own profile | SELECT | `id = auth.uid()` |

→ Un ejecutivo no es admin ni es dueño de esas filas, así que `select` devuelve **0 perfiles**. El hook entrega `inspectorProfiles = {}`, todos caen al fallback "Inspector sin nombre", y el `<Select>` colapsa todos los IDs bajo esa etiqueta (visualmente parece "no filtra").

El filtro sí está conectado (`inspectorFilter !== 'all' && i.inspector_id !== inspectorFilter`) — el bug es 100% de visibilidad de datos, no de lógica de filtrado.

Mismo problema afecta cualquier vista ejecutiva que muestre nombre de inspector (detalle, calendario, etc.).

## Fix propuesto

Permitir a roles operativos (`executive`, `admin`) leer los campos públicos de perfiles de staff. Mantener PII fuera del alcance del rol `inspector` y de usuarios `pending`.

### Migración

Añadir policy SELECT adicional sobre `public.profiles`:

```sql
CREATE POLICY "Executives can view staff profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'executive')
  AND role IN ('inspector', 'executive', 'admin')
);
```

- No expande lo que ve el inspector (sigue viendo solo el suyo).
- No expone usuarios `pending` / rechazados.
- Resuelve el dropdown + nombres en filas.

### Alternativa más estricta (opcional, si se prefiere)

Crear vista `public.staff_profiles_public` con `SELECT id, full_name, role` (sin email) y `security_invoker=on`, y consumirla desde `listProfilesByIds`. Más trabajo pero esconde el email del ejecutivo. Recomiendo **dejarlo para una fase posterior** y por ahora aplicar la policy directa: el email del staff ya es interno.

## Verificación

1. Loguearse como ejecutivo.
2. `/executive/review` → abrir el filtro "Todos los inspectores" → debe listar los nombres reales.
3. Seleccionar un inspector → la lista se reduce a sus inspecciones.
4. En cada fila del bucket, ver `Inspector: <nombre>` en vez de "Inspector sin nombre".

## Fuera de alcance

No se toca lógica de UI ni el hook — solo RLS. La capa de servicio ya está lista.
