-- Filtros consistentes e leitura econômica de documentos oficiais.

ALTER TABLE public.leila_properties
  ADD COLUMN IF NOT EXISTS filter_area_m2 NUMERIC(10,2)
  GENERATED ALWAYS AS (
    COALESCE(NULLIF(useful_area_m2, 0), NULLIF(area_m2, 0))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_leila_properties_filter_area
  ON public.leila_properties(filter_area_m2)
  WHERE is_active = TRUE AND availability_status <> 'unavailable';

CREATE INDEX IF NOT EXISTS idx_leila_properties_state_city_active
  ON public.leila_properties(state, city)
  WHERE is_active = TRUE AND availability_status <> 'unavailable';

CREATE INDEX IF NOT EXISTS idx_leila_properties_source_active
  ON public.leila_properties(source_id)
  WHERE is_active = TRUE AND availability_status <> 'unavailable';

CREATE INDEX IF NOT EXISTS idx_leila_properties_area_classification_active
  ON public.leila_properties(area_classification)
  WHERE is_active = TRUE AND availability_status <> 'unavailable';

ALTER TABLE public.leila_filters
  ADD COLUMN IF NOT EXISTS area_min NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS area_max NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS source_ids TEXT[] NOT NULL DEFAULT '{}';

-- Os registros anteriores à nova coleta não tinham classificação. O backfill
-- replica os mesmos patamares conservadores usados pelo scraper. Novas coletas
-- continuam preferindo sinais explícitos de bairro antes do preço por m².
WITH classified AS (
  SELECT
    id,
    CASE
      WHEN appraised_value IS NULL OR filter_area_m2 IS NULL OR filter_area_m2 <= 0
        THEN 'indefinido'
      WHEN lower(trim(city)) = ANY (ARRAY[
        'são paulo','rio de janeiro','brasília','curitiba','porto alegre',
        'florianópolis','campinas','santos','niterói','são bernardo do campo',
        'guarulhos','osasco','santo andré','são caetano do sul','barueri',
        'alphaville','tamboré'
      ]) THEN CASE
        WHEN appraised_value / filter_area_m2 >= 9000 THEN 'nobre'
        WHEN appraised_value / filter_area_m2 >= 4500 THEN 'intermediário'
        WHEN appraised_value / filter_area_m2 >= 1800 THEN 'popular'
        ELSE 'comunidade'
      END
      WHEN lower(trim(city)) = ANY (ARRAY[
        'belo horizonte','fortaleza','recife','salvador','manaus','belém',
        'goiânia','natal','maceió','joão pessoa','teresina','aracaju',
        'campo grande','cuiabá','porto velho','macapá','boa vista','palmas',
        'vitória','são luís','londrina','maringá','joinville','blumenau',
        'caxias do sul','pelotas','uberlândia','ribeirão preto','sorocaba',
        'são josé dos campos','mogi das cruzes','diadema'
      ]) THEN CASE
        WHEN appraised_value / filter_area_m2 >= 5500 THEN 'nobre'
        WHEN appraised_value / filter_area_m2 >= 2500 THEN 'intermediário'
        WHEN appraised_value / filter_area_m2 >= 1000 THEN 'popular'
        ELSE 'comunidade'
      END
      ELSE CASE
        WHEN appraised_value / filter_area_m2 >= 3500 THEN 'nobre'
        WHEN appraised_value / filter_area_m2 >= 1500 THEN 'intermediário'
        WHEN appraised_value / filter_area_m2 >= 600 THEN 'popular'
        ELSE 'comunidade'
      END
    END AS classification
  FROM public.leila_properties
  WHERE area_classification IS NULL
)
UPDATE public.leila_properties AS property
SET area_classification = classified.classification,
    updated_at = NOW()
FROM classified
WHERE property.id = classified.id;

CREATE OR REPLACE FUNCTION public.leila_filter_cities(
  p_states TEXT[] DEFAULT '{}',
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE(name TEXT, property_count BIGINT)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT trim(city) AS name, COUNT(*) AS property_count
  FROM public.leila_properties
  WHERE is_active = TRUE
    AND availability_status <> 'unavailable'
    AND city IS NOT NULL
    AND trim(city) <> ''
    AND (cardinality(p_states) = 0 OR trim(state::TEXT) = ANY(p_states))
    AND (NULLIF(trim(p_search), '') IS NULL OR city ILIKE '%' || trim(p_search) || '%')
  GROUP BY trim(city)
  ORDER BY COUNT(*) DESC, trim(city)
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.leila_filter_cities(TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leila_filter_cities(TEXT[], TEXT) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.leila_document_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL UNIQUE REFERENCES public.leila_properties(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'done', 'error', 'unavailable')),
  source_url TEXT NOT NULL,
  document_hash TEXT,
  prompt_version TEXT NOT NULL DEFAULT 'document-v1',
  provider TEXT,
  model TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  analysis JSONB,
  evidence JSONB NOT NULL DEFAULT '[]',
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  error_message TEXT,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leila_document_analyses_status
  ON public.leila_document_analyses(status, updated_at DESC);

ALTER TABLE public.leila_document_analyses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.leila_document_analyses FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.leila_document_analyses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leila_document_analyses TO service_role;

DROP POLICY IF EXISTS "Authenticated users can read document analyses"
  ON public.leila_document_analyses;
CREATE POLICY "Authenticated users can read document analyses"
  ON public.leila_document_analyses
  FOR SELECT
  TO authenticated
  USING (TRUE);
