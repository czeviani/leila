-- Internal ingestion tables are intentionally hidden from the client roles.
-- Keep explicit service_role policies so the RLS posture is auditable.

DROP POLICY IF EXISTS "Service role manages ingestion items" ON public.leila_ingestion_items;
CREATE POLICY "Service role manages ingestion items"
  ON public.leila_ingestion_items
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages property snapshots" ON public.leila_property_snapshots;
CREATE POLICY "Service role manages property snapshots"
  ON public.leila_property_snapshots
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
