-- Canonicalize spelling before rebuilding profiles. The profile uniqueness
-- key is accent-insensitive, while the legacy aggregation grouped by the raw
-- city string, which could produce both SAO PAULO and São Paulo in one insert.
UPDATE public.leila_properties
SET city = 'São Paulo',
    updated_at = NOW()
WHERE in_scope = TRUE
  AND city IS DISTINCT FROM 'São Paulo';

SELECT public.leila_refresh_neighborhood_profiles(ARRAY['SP']::TEXT[]);
