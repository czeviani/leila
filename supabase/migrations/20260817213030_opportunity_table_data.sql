-- Mesa de Oportunidades: dimensões comparáveis, ranking explicável e perfil
-- econômico de bairro calculado exclusivamente sobre a base interna da Leila.

CREATE OR REPLACE FUNCTION public.leila_normalize_geo_label(p_value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = public, extensions
AS $$
  SELECT NULLIF(
    trim(regexp_replace(lower(extensions.unaccent(p_value)), '[^a-z0-9]+', ' ', 'g')),
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.leila_normalize_geo_label(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leila_normalize_geo_label(TEXT) TO service_role;

ALTER TABLE public.leila_properties
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood_key TEXT,
  ADD COLUMN IF NOT EXISTS price_per_m2 NUMERIC(14,2)
    GENERATED ALWAYS AS (
      CASE
        WHEN COALESCE(NULLIF(useful_area_m2, 0), NULLIF(area_m2, 0)) IS NULL THEN NULL
        ELSE ROUND(
          auction_price / COALESCE(NULLIF(useful_area_m2, 0), NULLIF(area_m2, 0)),
          2
        )
      END
    ) STORED,
  ADD COLUMN IF NOT EXISTS opportunity_score NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS opportunity_confidence TEXT,
  ADD COLUMN IF NOT EXISTS opportunity_components JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS opportunity_score_version TEXT NOT NULL DEFAULT 'internal-auction-v1',
  ADD COLUMN IF NOT EXISTS neighborhood_score NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS neighborhood_confidence TEXT;

ALTER TABLE public.leila_properties
  DROP CONSTRAINT IF EXISTS leila_properties_opportunity_score_check,
  DROP CONSTRAINT IF EXISTS leila_properties_neighborhood_score_check,
  DROP CONSTRAINT IF EXISTS leila_properties_opportunity_confidence_check,
  DROP CONSTRAINT IF EXISTS leila_properties_neighborhood_confidence_check;

ALTER TABLE public.leila_properties
  ADD CONSTRAINT leila_properties_opportunity_score_check
    CHECK (opportunity_score IS NULL OR opportunity_score BETWEEN 0 AND 100),
  ADD CONSTRAINT leila_properties_neighborhood_score_check
    CHECK (neighborhood_score IS NULL OR neighborhood_score BETWEEN 0 AND 100),
  ADD CONSTRAINT leila_properties_opportunity_confidence_check
    CHECK (opportunity_confidence IS NULL OR opportunity_confidence IN ('low', 'medium', 'high')),
  ADD CONSTRAINT leila_properties_neighborhood_confidence_check
    CHECK (neighborhood_confidence IS NULL OR neighborhood_confidence IN ('low', 'medium', 'high'));

-- O CSV da Caixa possui bairro explícito em raw_data. Não tentamos adivinhar
-- bairro a partir do endereço quando a fonte não o informa.
UPDATE public.leila_properties
SET neighborhood = initcap(trim(raw_data ->> 'bairro')),
    neighborhood_key = public.leila_normalize_geo_label(raw_data ->> 'bairro'),
    updated_at = NOW()
WHERE NULLIF(trim(raw_data ->> 'bairro'), '') IS NOT NULL
  AND (neighborhood IS NULL OR neighborhood_key IS NULL);

CREATE OR REPLACE FUNCTION public.leila_trg_normalize_neighborhood()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
BEGIN
  NEW.neighborhood := NULLIF(initcap(trim(regexp_replace(NEW.neighborhood, '\s+', ' ', 'g'))), '');
  NEW.neighborhood_key := public.leila_normalize_geo_label(NEW.neighborhood);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.leila_trg_normalize_neighborhood() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leila_trg_normalize_neighborhood() TO service_role;

DROP TRIGGER IF EXISTS trg_leila_normalize_neighborhood ON public.leila_properties;
CREATE TRIGGER trg_leila_normalize_neighborhood
  BEFORE INSERT OR UPDATE OF neighborhood
  ON public.leila_properties
  FOR EACH ROW EXECUTE FUNCTION public.leila_trg_normalize_neighborhood();

CREATE INDEX IF NOT EXISTS idx_leila_properties_neighborhood_active
  ON public.leila_properties(state, city, neighborhood_key)
  WHERE is_active = TRUE AND availability_status <> 'unavailable';

CREATE INDEX IF NOT EXISTS idx_leila_properties_price_per_m2_active
  ON public.leila_properties(price_per_m2)
  WHERE is_active = TRUE AND availability_status <> 'unavailable';

CREATE INDEX IF NOT EXISTS idx_leila_properties_opportunity_active
  ON public.leila_properties(opportunity_score DESC NULLS LAST)
  WHERE is_active = TRUE AND availability_status <> 'unavailable';

CREATE INDEX IF NOT EXISTS idx_leila_properties_neighborhood_score_active
  ON public.leila_properties(neighborhood_score DESC NULLS LAST)
  WHERE is_active = TRUE AND availability_status <> 'unavailable';

CREATE TABLE IF NOT EXISTS public.leila_neighborhood_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state CHAR(2) NOT NULL,
  city TEXT NOT NULL,
  city_key TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  neighborhood_key TEXT NOT NULL,
  property_count INTEGER NOT NULL CHECK (property_count >= 0),
  priced_property_count INTEGER NOT NULL CHECK (priced_property_count >= 0),
  median_auction_price NUMERIC(14,2),
  median_price_per_m2 NUMERIC(14,2),
  price_per_m2_p25 NUMERIC(14,2),
  price_per_m2_p75 NUMERIC(14,2),
  median_discount_pct NUMERIC(6,2),
  data_coverage_pct NUMERIC(5,1) NOT NULL CHECK (data_coverage_pct BETWEEN 0 AND 100),
  recently_verified_pct NUMERIC(5,1) NOT NULL CHECK (recently_verified_pct BETWEEN 0 AND 100),
  score NUMERIC(5,1) CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  score_components JSONB NOT NULL DEFAULT '{}',
  score_version TEXT NOT NULL DEFAULT 'internal-auction-v1',
  source_scope TEXT NOT NULL DEFAULT 'leila_active_listings',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(state, city_key, neighborhood_key)
);

CREATE INDEX IF NOT EXISTS idx_leila_neighborhood_profiles_lookup
  ON public.leila_neighborhood_profiles(state, city_key, neighborhood_key);
CREATE INDEX IF NOT EXISTS idx_leila_neighborhood_profiles_score
  ON public.leila_neighborhood_profiles(score DESC NULLS LAST);

ALTER TABLE public.leila_neighborhood_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.leila_neighborhood_profiles FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.leila_neighborhood_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leila_neighborhood_profiles TO service_role;

DROP POLICY IF EXISTS "Authenticated users can read neighborhood profiles"
  ON public.leila_neighborhood_profiles;
CREATE POLICY "Authenticated users can read neighborhood profiles"
  ON public.leila_neighborhood_profiles FOR SELECT TO authenticated USING (TRUE);

CREATE TABLE IF NOT EXISTS public.leila_discarded_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.leila_properties(id) ON DELETE CASCADE,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_leila_discarded_properties_user_created
  ON public.leila_discarded_properties(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leila_discarded_properties_property
  ON public.leila_discarded_properties(property_id);

ALTER TABLE public.leila_discarded_properties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.leila_discarded_properties FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leila_discarded_properties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leila_discarded_properties TO service_role;

DROP POLICY IF EXISTS "Users can read own discarded properties" ON public.leila_discarded_properties;
CREATE POLICY "Users can read own discarded properties"
  ON public.leila_discarded_properties FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own discarded properties" ON public.leila_discarded_properties;
CREATE POLICY "Users can insert own discarded properties"
  ON public.leila_discarded_properties FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own discarded properties" ON public.leila_discarded_properties;
CREATE POLICY "Users can update own discarded properties"
  ON public.leila_discarded_properties FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own discarded properties" ON public.leila_discarded_properties;
CREATE POLICY "Users can delete own discarded properties"
  ON public.leila_discarded_properties FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

ALTER TABLE public.leila_filters
  ADD COLUMN IF NOT EXISTS neighborhoods TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price_per_m2_min NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS price_per_m2_max NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS opportunity_score_min NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS neighborhood_score_min NUMERIC(5,1);

-- Calcula o ranking do imóvel usando desconto, valor relativo dentro do mesmo
-- bairro, completude e verificação. Não premia região geográfica nem urgência.
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
  property_price_per_m2 NUMERIC := NULL;
BEGIN
  IF COALESCE(NULLIF(NEW.useful_area_m2, 0), NULLIF(NEW.area_m2, 0)) IS NOT NULL THEN
    property_price_per_m2 := ROUND(
      NEW.auction_price / COALESCE(NULLIF(NEW.useful_area_m2, 0), NULLIF(NEW.area_m2, 0)),
      2
    );
  END IF;

  SELECT * INTO profile
  FROM public.leila_neighborhood_profiles
  WHERE state = NEW.state
    AND city_key = public.leila_normalize_geo_label(NEW.city)
    AND neighborhood_key = NEW.neighborhood_key;

  discount_points := ROUND(LEAST(GREATEST(COALESCE(NEW.discount_pct, 0), 0) / 50, 1) * 40, 1);
  quality_points := ROUND(LEAST(GREATEST(COALESCE(NEW.data_quality_score, 0), 0) / 100, 1) * 15, 1);
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
    'excludes', jsonb_build_array('geographic_region_bonus', 'auction_urgency_bonus')
  );
  NEW.opportunity_score_version := 'internal-auction-v1';
  -- Compatibilidade temporária com clientes antigos que ainda leem heat_score.
  NEW.heat_score := NEW.opportunity_score;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.leila_trg_opportunity_score() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leila_trg_opportunity_score() TO service_role;

DROP TRIGGER IF EXISTS trg_leila_opportunity_score ON public.leila_properties;
CREATE TRIGGER trg_leila_opportunity_score
  BEFORE INSERT OR UPDATE OF discount_pct, auction_price, area_m2, useful_area_m2,
    neighborhood, neighborhood_key, city, state, data_quality_score,
    availability_status, last_verified_at
  ON public.leila_properties
  FOR EACH ROW EXECUTE FUNCTION public.leila_trg_opportunity_score();

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
  ), scored AS (
    SELECT aggregates.*,
      CASE
        WHEN priced_property_count < 5 THEN NULL
        ELSE ROUND((
          LEAST(GREATEST(COALESCE(median_discount_pct, 0), 0) / 50, 1) * 35
          + CASE WHEN COUNT(*) OVER (PARTITION BY state, city_key) = 1 THEN 17.5
                 ELSE (1 - percent_rank() OVER (PARTITION BY state, city_key ORDER BY median_price_per_m2 ASC NULLS LAST)) * 35 END
          + coverage_pct / 100 * 15
          + freshness_pct / 100 * 10
          + LEAST(property_count::NUMERIC / 25, 1) * 5
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
    data_coverage_pct, recently_verified_pct, score, confidence, score_components
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
      'minimum_sample_for_score', 5
    )
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
    'score_version', 'internal-auction-v1'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.leila_refresh_neighborhood_profiles(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leila_refresh_neighborhood_profiles(TEXT[]) TO service_role;

-- Backfill inicial. A função é idempotente e poderá ser chamada uma vez por
-- coleta válida, evitando qualquer custo de IA ou atualização por visualização.
SELECT public.leila_refresh_neighborhood_profiles('{}'::TEXT[]);
