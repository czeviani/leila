-- Corrige a base estatística da Mesa de Oportunidades após validação com dados
-- reais: área privativa explícita, divisão decimal da qualidade e proteção
-- contra valores de R$/m² materialmente implausíveis.

WITH extracted AS (
  SELECT
    id,
    replace(
      (regexp_match(
        description,
        '([0-9]+[.,][0-9]+)[[:space:]]*(m²|m2)?[[:space:]]*de[[:space:]]+área[[:space:]]+privativa',
        'i'
      ))[1],
      ',', '.'
    )::NUMERIC AS private_area
  FROM public.leila_properties
  WHERE description ~* 'área[[:space:]]+privativa'
)
UPDATE public.leila_properties property
SET useful_area_m2 = extracted.private_area,
    updated_at = NOW()
FROM extracted
WHERE property.id = extracted.id
  AND extracted.private_area >= 5
  AND property.useful_area_m2 IS DISTINCT FROM extracted.private_area;

CREATE OR REPLACE FUNCTION public.leila_trg_opportunity_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  profile public.leila_neighborhood_profiles%ROWTYPE;
  discount_points NUMERIC := 0;
  relative_value_points NUMERIC := 0;
  quality_points NUMERIC := 0;
  trust_points NUMERIC := 0;
  effective_area NUMERIC := NULL;
  property_price_per_m2 NUMERIC := NULL;
BEGIN
  effective_area := COALESCE(
    CASE WHEN NEW.useful_area_m2 >= 5 THEN NEW.useful_area_m2 END,
    CASE WHEN NEW.area_m2 >= 5 THEN NEW.area_m2 END
  );

  IF effective_area IS NOT NULL AND NEW.auction_price > 0 THEN
    property_price_per_m2 := ROUND(NEW.auction_price / effective_area, 2);
    IF property_price_per_m2 < 100 OR property_price_per_m2 > 100000 THEN
      property_price_per_m2 := NULL;
    END IF;
  END IF;

  SELECT * INTO profile
  FROM public.leila_neighborhood_profiles
  WHERE state = NEW.state
    AND city_key = public.leila_normalize_geo_label(NEW.city)
    AND neighborhood_key = NEW.neighborhood_key;

  discount_points := ROUND(LEAST(GREATEST(COALESCE(NEW.discount_pct, 0), 0) / 50.0, 1) * 40, 1);
  quality_points := ROUND(LEAST(GREATEST(COALESCE(NEW.data_quality_score, 0), 0) / 100.0, 1) * 15, 1);
  trust_points := (CASE WHEN NEW.availability_status = 'available' THEN 5 ELSE 0 END)
    + (CASE WHEN NEW.last_verified_at >= NOW() - INTERVAL '30 days' THEN 5 ELSE 0 END);

  IF property_price_per_m2 IS NOT NULL AND profile.median_price_per_m2 > 0 THEN
    relative_value_points := ROUND(CASE
      WHEN property_price_per_m2 <= profile.median_price_per_m2 THEN
        17.5 + LEAST((profile.median_price_per_m2 - property_price_per_m2) / profile.median_price_per_m2, 1) * 17.5
      ELSE GREATEST(17.5 * (2 - property_price_per_m2 / profile.median_price_per_m2), 0)
    END, 1);
  END IF;

  NEW.neighborhood_score := profile.score;
  NEW.neighborhood_confidence := profile.confidence;
  NEW.opportunity_score := ROUND(LEAST(discount_points + relative_value_points + quality_points + trust_points, 100), 1);
  NEW.opportunity_confidence := CASE
    WHEN property_price_per_m2 IS NOT NULL AND NEW.discount_pct IS NOT NULL
      AND profile.confidence IN ('medium', 'high') AND NEW.data_quality_score >= 70 THEN 'high'
    WHEN property_price_per_m2 IS NOT NULL AND NEW.discount_pct IS NOT NULL THEN 'medium'
    ELSE 'low'
  END;
  NEW.opportunity_components := jsonb_build_object(
    'discount', jsonb_build_object('points', discount_points, 'max_points', 40, 'value_pct', NEW.discount_pct),
    'relative_value', jsonb_build_object('points', relative_value_points, 'max_points', 35, 'property_price_per_m2', property_price_per_m2, 'neighborhood_median_price_per_m2', profile.median_price_per_m2),
    'data_quality', jsonb_build_object('points', quality_points, 'max_points', 15, 'quality_score', NEW.data_quality_score),
    'availability_trust', jsonb_build_object('points', trust_points, 'max_points', 10, 'status', NEW.availability_status, 'last_verified_at', NEW.last_verified_at),
    'scope', 'active_listings_in_leila',
    'excludes', jsonb_build_array('geographic_region_bonus', 'auction_urgency_bonus'),
    'plausible_price_per_m2_range', jsonb_build_array(100, 100000)
  );
  NEW.opportunity_score_version := 'internal-auction-v1.1';
  NEW.heat_score := NEW.opportunity_score;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.leila_trg_opportunity_score() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leila_trg_opportunity_score() TO service_role;

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
      COUNT(*) FILTER (WHERE price_per_m2 BETWEEN 100 AND 100000)::INTEGER AS priced_property_count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY auction_price)::NUMERIC(14,2) AS median_auction_price,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_m2)
        FILTER (WHERE price_per_m2 BETWEEN 100 AND 100000)::NUMERIC(14,2) AS median_price_per_m2,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY price_per_m2)
        FILTER (WHERE price_per_m2 BETWEEN 100 AND 100000)::NUMERIC(14,2) AS price_per_m2_p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY price_per_m2)
        FILTER (WHERE price_per_m2 BETWEEN 100 AND 100000)::NUMERIC(14,2) AS price_per_m2_p75,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY discount_pct)::NUMERIC(6,2) AS median_discount_pct,
      ROUND((COUNT(*) FILTER (WHERE price_per_m2 BETWEEN 100 AND 100000)::NUMERIC / COUNT(*)) * 100, 1) AS coverage_pct,
      ROUND((COUNT(*) FILTER (WHERE last_verified_at >= NOW() - INTERVAL '30 days')::NUMERIC / COUNT(*)) * 100, 1) AS freshness_pct
    FROM public.leila_properties
    WHERE is_active = TRUE
      AND availability_status <> 'unavailable'
      AND neighborhood_key IS NOT NULL
      AND city IS NOT NULL
      AND state IS NOT NULL
      AND (cardinality(COALESCE(p_states, '{}')) = 0 OR trim(state::TEXT) = ANY(p_states))
    GROUP BY trim(state::TEXT), trim(city), public.leila_normalize_geo_label(city), neighborhood_key
  ), scored AS (
    SELECT aggregates.*,
      CASE
        WHEN priced_property_count < 5 THEN NULL
        ELSE ROUND((
          LEAST(GREATEST(COALESCE(median_discount_pct, 0), 0) / 50.0, 1) * 35
          + CASE WHEN COUNT(*) OVER (PARTITION BY state, city_key) = 1 THEN 17.5
                 ELSE (1 - percent_rank() OVER (PARTITION BY state, city_key ORDER BY median_price_per_m2 ASC NULLS LAST)) * 35 END
          + coverage_pct / 100.0 * 15
          + freshness_pct / 100.0 * 10
          + LEAST(property_count::NUMERIC / 25.0, 1) * 5
        )::NUMERIC, 1)
      END AS score,
      CASE
        WHEN property_count >= 25 AND coverage_pct >= 80 AND freshness_pct >= 70 THEN 'high'
        WHEN property_count >= 8 AND coverage_pct >= 50 THEN 'medium'
        ELSE 'low'
      END AS confidence
    FROM aggregates
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
      'plausible_price_per_m2_range', jsonb_build_array(100, 100000)
    ),
    'internal-auction-v1.1'
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
    'score_version', 'internal-auction-v1.1'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.leila_refresh_neighborhood_profiles(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leila_refresh_neighborhood_profiles(TEXT[]) TO service_role;

SELECT public.leila_refresh_neighborhood_profiles('{}'::TEXT[]);
