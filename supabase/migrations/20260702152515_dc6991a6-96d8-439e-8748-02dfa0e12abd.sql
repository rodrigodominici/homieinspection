UPDATE public.inspections
   SET status = 'assigned', updated_at = now()
 WHERE status = 'pending_assignment'
   AND inspector_id IS NOT NULL
   AND executive_id IS NOT NULL;