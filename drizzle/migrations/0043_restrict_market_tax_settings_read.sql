DROP POLICY IF EXISTS "Authenticated read market tax settings" ON public.market_tax_settings;
CREATE POLICY "Active approved users read market tax settings" ON public.market_tax_settings
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active AND p.approval_status = 'approved'));