CREATE INDEX IF NOT EXISTS idx_leila_properties_scope_reconcile
  ON public.leila_properties(source_id, city, last_seen_at)
  WHERE in_scope = TRUE AND availability_status <> 'unavailable';

CREATE OR REPLACE FUNCTION public.leila_reconcile_missing_scope(
  p_source_id TEXT,
  p_verified_states TEXT[],
  p_scrape_start TIMESTAMPTZ,
  p_scope_city TEXT
)
RETURNS TABLE(suspect_count BIGINT, unavailable_count BIGINT)
LANGUAGE SQL
SECURITY INVOKER
SET search_path = public
AS $$
  WITH changed AS (
    UPDATE public.leila_properties
    SET missing_count = LEAST(missing_count + 1, 2)::SMALLINT,
        availability_status = CASE WHEN missing_count >= 1 THEN 'unavailable' ELSE 'suspect' END,
        is_active = CASE WHEN missing_count >= 1 THEN FALSE ELSE is_active END,
        last_verified_at = CASE WHEN missing_count >= 1 THEN NOW() ELSE last_verified_at END,
        updated_at = NOW()
    WHERE source_id = p_source_id
      AND in_scope = TRUE
      AND state = ANY(p_verified_states)
      AND city = p_scope_city
      AND last_seen_at < p_scrape_start
      AND availability_status <> 'unavailable'
    RETURNING availability_status
  )
  SELECT COUNT(*) FILTER (WHERE availability_status = 'suspect'),
         COUNT(*) FILTER (WHERE availability_status = 'unavailable')
  FROM changed;
$$;

REVOKE ALL ON FUNCTION public.leila_reconcile_missing_scope(TEXT, TEXT[], TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leila_reconcile_missing_scope(TEXT, TEXT[], TIMESTAMPTZ, TEXT)
  TO service_role;
