-- Proximidade aproximada entre o endereço de trabalho do usuário único e os
-- imóveis. As coordenadas vêm de geocodificação baseada em dados abertos; a
-- distância é calculada localmente, sem uma API paga de rotas.

ALTER TABLE public.leila_settings
  ADD COLUMN IF NOT EXISTS work_address TEXT,
  ADD COLUMN IF NOT EXISTS work_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS work_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS work_geocode_provider TEXT,
  ADD COLUMN IF NOT EXISTS work_geocode_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS work_geocoded_at TIMESTAMPTZ;

ALTER TABLE public.leila_settings
  DROP CONSTRAINT IF EXISTS leila_settings_work_latitude_check,
  DROP CONSTRAINT IF EXISTS leila_settings_work_longitude_check,
  DROP CONSTRAINT IF EXISTS leila_settings_work_geocode_confidence_check;

ALTER TABLE public.leila_settings
  ADD CONSTRAINT leila_settings_work_latitude_check
    CHECK (work_latitude IS NULL OR work_latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT leila_settings_work_longitude_check
    CHECK (work_longitude IS NULL OR work_longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT leila_settings_work_geocode_confidence_check
    CHECK (work_geocode_confidence IS NULL OR work_geocode_confidence BETWEEN 0 AND 1);

ALTER TABLE public.leila_properties
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geocode_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS geocode_provider TEXT,
  ADD COLUMN IF NOT EXISTS geocode_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS geocode_match_type TEXT,
  ADD COLUMN IF NOT EXISTS geocode_query TEXT,
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_distance_km NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS estimated_road_distance_km NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS estimated_commute_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS distance_calculated_at TIMESTAMPTZ;

ALTER TABLE public.leila_properties
  DROP CONSTRAINT IF EXISTS leila_properties_latitude_check,
  DROP CONSTRAINT IF EXISTS leila_properties_longitude_check,
  DROP CONSTRAINT IF EXISTS leila_properties_geocode_status_check,
  DROP CONSTRAINT IF EXISTS leila_properties_geocode_confidence_check,
  DROP CONSTRAINT IF EXISTS leila_properties_distance_check;

ALTER TABLE public.leila_properties
  ADD CONSTRAINT leila_properties_latitude_check
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT leila_properties_longitude_check
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT leila_properties_geocode_status_check
    CHECK (geocode_status IN ('pending', 'success', 'approximate', 'failed')),
  ADD CONSTRAINT leila_properties_geocode_confidence_check
    CHECK (geocode_confidence IS NULL OR geocode_confidence BETWEEN 0 AND 1),
  ADD CONSTRAINT leila_properties_distance_check
    CHECK (
      (work_distance_km IS NULL OR work_distance_km >= 0)
      AND (estimated_road_distance_km IS NULL OR estimated_road_distance_km >= 0)
      AND (estimated_commute_minutes IS NULL OR estimated_commute_minutes >= 0)
    );

CREATE INDEX IF NOT EXISTS idx_leila_properties_work_distance
  ON public.leila_properties(work_distance_km)
  WHERE is_active = TRUE AND availability_status <> 'unavailable';

CREATE INDEX IF NOT EXISTS idx_leila_properties_geocode_pending
  ON public.leila_properties(geocode_status, opportunity_score DESC)
  WHERE is_active = TRUE AND availability_status <> 'unavailable';

COMMENT ON COLUMN public.leila_properties.work_distance_km IS
  'Distância aproximada em linha reta até o trabalho do usuário único.';
COMMENT ON COLUMN public.leila_properties.estimated_road_distance_km IS
  'Estimativa matemática: distância em linha reta multiplicada por 1,25.';
COMMENT ON COLUMN public.leila_properties.estimated_commute_minutes IS
  'Estimativa matemática sem trânsito e sem consulta a API de rotas.';
