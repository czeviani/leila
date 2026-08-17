-- Mantém exibição, filtros, ordenação e estatística de bairro sobre a mesma
-- definição de R$/m² plausível. O ranking relativo considera somente bairros
-- com amostra mínima válida.

DROP INDEX IF EXISTS public.idx_leila_properties_price_per_m2_active;

ALTER TABLE public.leila_properties DROP COLUMN price_per_m2;
ALTER TABLE public.leila_properties
  ADD COLUMN price_per_m2 NUMERIC(14,2)
  GENERATED ALWAYS AS (
    CASE
      WHEN auction_price > 0
        AND COALESCE(
          CASE WHEN useful_area_m2 >= 5 THEN useful_area_m2 END,
          CASE WHEN area_m2 >= 5 THEN area_m2 END
        ) IS NOT NULL
        AND auction_price / COALESCE(
          CASE WHEN useful_area_m2 >= 5 THEN useful_area_m2 END,
          CASE WHEN area_m2 >= 5 THEN area_m2 END
        ) BETWEEN 100 AND 100000
      THEN ROUND(
        auction_price / COALESCE(
          CASE WHEN useful_area_m2 >= 5 THEN useful_area_m2 END,
          CASE WHEN area_m2 >= 5 THEN area_m2 END
        ),
        2
      )
      ELSE NULL
    END
  ) STORED;

CREATE INDEX idx_leila_properties_price_per_m2_active
  ON public.leila_properties(price_per_m2)
  WHERE is_active = TRUE AND availability_status <> 'unavailable';

CREATE OR REPLACE FUNCTION public.leila_refresh_neighborhood_profiles(
  p_states TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  refreshed_profiles INTEGER := 0;
  refreshed_properties INTEGER := 0;
BEGIN
  DELETE FROM public.leila_neighborhood_profiles profile
  WHERE cardinality(COALESCE(p_states, '{}')) = 0 OR profile.state = ANY(p_states);

  WITH aggregates AS (
    SELECT
      trim(state::TEXT)::CHAR(2) AS state,
      trim(city) AS city,
      public.leila_normalize_geo_label(city) AS city_key,
      min(neighborhood) AS neighborhood,
      neighborhood_key,
      COUNT(*)::INTEGER AS property_count,
      COUNT(price_per_m2)::INTEGER AS priced_property_count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY auction_price)::NUMERIC(14,2) AS median_auction_price,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_m2)::NUMERIC(14,2) AS median_price_per_m2,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY price_per_m2)::NUMERIC(14,2) AS price_per_m2_p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY price_per_m2)::NUMERIC(14,2) AS price_per_m2_p75,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY discount_pct)::NUMERIC(6,2) AS median_discount_pct,
      ROUND((COUNT(price_per_m2)::NUMERIC / COUNT(*)) * 100, 1) AS coverage_pct,
      ROUND((COUNT(*) FILTER (WHERE last_verified_at >= NOW() - INTERVAL '30 days')::NUMERIC / COUNT(*)) * 100, 1) AS freshness_pct
    FROM public.leila_properties
    WHERE is_active = TRUE
      AND availability_status <> 'unavailable'
      AND neighborhood_key IS NOT NULL
      AND city IS NOT NULL
      AND state IS NOT NULL
      AND (cardinality(COALESCE(p_states, '{}')) = 0 OR trim(state::TEXT) = ANY(p_states))
    GROUP BY trim(state::TEXT), trim(city), public.leila_normalize_geo_label(city), neighborhood_key
  ), eligible_ranked AS (
    SELECT
      state,
      city_key,
      neighborhood_key,
      percent_rank() OVER (PARTITION BY state, city_key ORDER BY median_price_per_m2 ASC) AS price_rank,
      COUNT(*) OVER (PARTITION BY state, city_key) AS eligible_count
    FROM aggregates
    WHERE priced_property_count >= 5
      AND median_price_per_m2 IS NOT NULL
  ), scored AS (
    SELECT aggregates.*,
      CASE
        WHEN aggregates.priced_property_count < 5 THEN NULL
        ELSE ROUND((
          LEAST(GREATEST(COALESCE(aggregates.median_discount_pct, 0), 0) / 50.0, 1) * 35
          + CASE WHEN eligible_ranked.eligible_count = 1 THEN 17.5
                 ELSE (1 - eligible_ranked.price_rank) * 35 END
          + aggregates.coverage_pct / 100.0 * 15
          + aggregates.freshness_pct / 100.0 * 10
          + LEAST(aggregates.property_count::NUMERIC / 25.0, 1) * 5
        )::NUMERIC, 1)
      END AS score,
      CASE
        WHEN aggregates.property_count >= 25 AND aggregates.coverage_pct >= 80 AND aggregates.freshness_pct >= 70 THEN 'high'
        WHEN aggregates.property_count >= 8 AND aggregates.coverage_pct >= 50 THEN 'medium'
        ELSE 'low'
      END AS confidence
    FROM aggregates
    LEFT JOIN eligible_ranked USING (state, city_key, neighborhood_key)
  )
  INSERT INTO public.leila_neighborhood_profiles (
    state, city, city_key, neighborhood, neighborhood_key, property_count,
    priced_property_count, median_auction_price, median_price_per_m2,
    price_per_m2_p25, price_per_m2_p75, median_discount_pct,
    data_coverage_pct, recently_verified_pct, score, confidence, score_components,
    score_version
  )
  SELECT
    state, city, city_key, neighborhood, neighborhood_key, property_count,
    priced_property_count, median_auction_price, median_price_per_m2,
    price_per_m2_p25, price_per_m2_p75, median_discount_pct,
    coverage_pct, freshness_pct, score, confidence,
    jsonb_build_object(
      'median_discount_pct', median_discount_pct,
      'median_price_per_m2', median_price_per_m2,
      'data_coverage_pct', coverage_pct,
      'recently_verified_pct', freshness_pct,
      'property_count', property_count,
      'priced_property_count', priced_property_count,
      'scope', 'active_listings_in_leila',
      'minimum_sample_for_score', 5,
      'plausible_price_per_m2_range', jsonb_build_array(100, 100000),
      'ranked_sample', 'eligible_neighborhoods_only'
    ),
    'internal-auction-v1.2'
  FROM scored;

  GET DIAGNOSTICS refreshed_profiles = ROW_COUNT;

  UPDATE public.leila_properties property
  SET discount_pct = property.discount_pct
  WHERE property.is_active = TRUE
    AND property.availability_status <> 'unavailable'
    AND property.neighborhood_key IS NOT NULL
    AND (cardinality(COALESCE(p_states, '{}')) = 0 OR trim(property.state::TEXT) = ANY(p_states));

  GET DIAGNOSTICS refreshed_properties = ROW_COUNT;
  RETURN jsonb_build_object(
    'profiles', refreshed_profiles,
    'properties', refreshed_properties,
    'score_version', 'internal-auction-v1.2'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.leila_refresh_neighborhood_profiles(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leila_refresh_neighborhood_profiles(TEXT[]) TO service_role;

SELECT public.leila_refresh_neighborhood_profiles('{}'::TEXT[]);
