

# Plan — Align Admin key-collection save with awaited sync + honest toast

## Change

Rewrite `handleSave` inside the key-collection popover in `src/pages/admin/AdminInspectionDetail.tsx` (currently lines ~644–670) to mirror the inspector flow exactly:

```ts
const handleSave = async () => {
  if (!inspection) return;
  setSavingKeyDate(true);
  try {
    // 1. Persist into property_overrides_json (same source the edge function reads)
    const overrides = {
      ...(inspection.property_overrides_json ?? {}),
      fecha_recoleccion_llaves: pickedDate,
      hora_recoleccion_llaves: pickedTime,
    };
    const { error } = await supabase
      .from('inspections')
      .update({ property_overrides_json: overrides })
      .eq('id', inspection.id);
    if (error) throw error;

    // 2. Update local state + close popover
    setInspection({ ...inspection, property_overrides_json: overrides });
    setKeyDatePopoverOpen(false);

    // 3. Honest local-save toast (does NOT claim HubSpot success)
    toast({
      title: 'Recolección guardada',
      description: 'Fecha/hora actualizada.',
    });

    // 4. Await sync; only then surface HubSpot outcome
    const syncRes = await triggerKeyCollectionSync(inspection.id);
    if (!syncRes.ok) {
      toast({
        variant: 'destructive',
        title: 'Sync HubSpot pendiente',
        description: 'La fecha se guardó pero no se pudo enviar a HubSpot. Revisa los logs salientes.',
      });
    }
  } catch (err) {
    toast({
      variant: 'destructive',
      title: 'Error al guardar',
      description: err instanceof Error ? err.message : 'Inténtalo de nuevo.',
    });
  } finally {
    setSavingKeyDate(false);
  }
};
```

Key properties:
- Optimistic toast only confirms the local save ("Recolección guardada / Fecha/hora actualizada."). No mention of HubSpot.
- HubSpot feedback is strictly conditional on the awaited result. Success is silent; failure raises a destructive toast pointing to outbound logs.
- `setSavingKeyDate(true/false)` wraps the entire try/finally so the "Guardar y enviar a HubSpot" CTA stays disabled until persistence + sync attempt both finish.
- Persistence source (`property_overrides_json.fecha_recoleccion_llaves` / `hora_recoleccion_llaves`) is unchanged and matches what the edge function reads.

## File touched

- `src/pages/admin/AdminInspectionDetail.tsx` — only the `handleSave` block inside the key-collection popover.

## Verification (in combination with the existing outbound logging fix)

1. Admin picks a date and clicks "Guardar y enviar a HubSpot" → CTA stays disabled until the sync resolves.
2. On success: only the neutral "Recolección guardada" toast appears; a `hubspot_sync_log` row with `action='key_collection_date'`, `status='success'` is written by the edge function.
3. On failure (network, missing external reference, HubSpot 4xx): neutral save toast appears, then a destructive "Sync HubSpot pendiente — revisa los logs salientes" toast; a `hubspot_sync_log` row with `status='error'` (or `skipped`) is written.
4. Every admin save attempt produces exactly one outbound log row visible at `/admin/integrations/hubspot/outbound-logs`.
5. The adjacent "Reenviar a HubSpot" button (already awaited) is unaffected.

## Summary deliverable

- **Root cause (recap):** admin save was fire-and-forget with an optimistic "enviada a HubSpot" toast hiding all sync failures.
- **Change:** admin `handleSave` now (a) persists, (b) shows a save-only toast, (c) awaits `triggerKeyCollectionSync`, (d) raises a destructive toast only on real failure, (e) keeps the CTA disabled across the full async chain.
- **Shared path:** admin and inspector flows now use the same persistence source, the same `triggerKeyCollectionSync` helper, and the same UX contract.
- **Observability:** combined with the prior outbound-logging fix, every admin save leaves a visible trace in `hubspot_sync_log` and the admin sees honest, conditional feedback.

