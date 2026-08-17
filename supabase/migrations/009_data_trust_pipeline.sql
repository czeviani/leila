-- Migration 009: trilha de proveniência e disponibilidade resiliente.
-- Um imóvel só deixa de ser exibido após duas coletas válidas consecutivas
-- sem observá-lo. Falhas de fonte/UF não contam como ausência.

ALTER TABLE leila_properties
  ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS missing_count SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_quality_score SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE leila_properties
  DROP CONSTRAINT IF EXISTS leila_properties_availability_status_check;

ALTER TABLE leila_properties
  ADD CONSTRAINT leila_properties_availability_status_check
  CHECK (availability_status IN ('available', 'suspect', 'unavailable'));

ALTER TABLE leila_properties
  DROP CONSTRAINT IF EXISTS leila_properties_missing_count_check;

ALTER TABLE leila_properties
  ADD CONSTRAINT leila_properties_missing_count_check
  CHECK (missing_count BETWEEN 0 AND 2);

ALTER TABLE leila_properties
  DROP CONSTRAINT IF EXISTS leila_properties_data_quality_score_check;

ALTER TABLE leila_properties
  ADD CONSTRAINT leila_properties_data_quality_score_check
  CHECK (data_quality_score BETWEEN 0 AND 100);

UPDATE leila_properties
SET last_seen_at = COALESCE(last_seen_at, scraped_at),
    last_verified_at = COALESCE(last_verified_at, scraped_at),
    availability_status = CASE WHEN is_active THEN 'available' ELSE 'unavailable' END
WHERE last_seen_at IS NULL OR last_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leila_properties_availability
  ON leila_properties(availability_status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_leila_properties_quality
  ON leila_properties(data_quality_score DESC)
  WHERE availability_status <> 'unavailable';

-- Reconciliação set-based e atômica. Fazer isso pelo cliente PostgREST teria
-- limite de paginação e poderia atualizar apenas parte dos imóveis de uma UF.
CREATE OR REPLACE FUNCTION leila_reconcile_missing(
  p_source_id TEXT,
  p_verified_states TEXT[],
  p_scrape_start TIMESTAMPTZ
)
RETURNS TABLE(suspect_count BIGINT, unavailable_count BIGINT)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  WITH changed AS (
    UPDATE leila_properties
    SET missing_count = LEAST(missing_count + 1, 2)::SMALLINT,
        availability_status = CASE
          WHEN missing_count >= 1 THEN 'unavailable'
          ELSE 'suspect'
        END,
        is_active = CASE WHEN missing_count >= 1 THEN FALSE ELSE is_active END,
        last_verified_at = CASE WHEN missing_count >= 1 THEN NOW() ELSE last_verified_at END,
        updated_at = NOW()
    WHERE source_id = p_source_id
      AND state = ANY(p_verified_states)
      AND COALESCE(last_seen_at, scraped_at) < p_scrape_start
      AND availability_status <> 'unavailable'
    RETURNING availability_status
  )
  SELECT COUNT(*) FILTER (WHERE availability_status = 'suspect'),
         COUNT(*) FILTER (WHERE availability_status = 'unavailable')
  FROM changed;
$$;

REVOKE ALL ON FUNCTION leila_reconcile_missing(TEXT, TEXT[], TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION leila_reconcile_missing(TEXT, TEXT[], TIMESTAMPTZ) TO service_role;

CREATE TABLE IF NOT EXISTS leila_ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL REFERENCES leila_sources(id),
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  found_count INTEGER NOT NULL DEFAULT 0,
  written_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  verified_regions TEXT[] NOT NULL DEFAULT '{}',
  failed_regions TEXT[] NOT NULL DEFAULT '{}',
  diagnostics JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_leila_ingestion_runs_source_started
  ON leila_ingestion_runs(source_id, started_at DESC);

ALTER TABLE leila_ingestion_runs ENABLE ROW LEVEL SECURITY;

-- Permissões explícitas para a Data API. Desde 2026 o Supabase não garante
-- mais grants automáticos em tabelas novas do schema public.
REVOKE ALL ON TABLE leila_ingestion_runs FROM anon;
GRANT SELECT ON TABLE leila_ingestion_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE leila_ingestion_runs TO service_role;

DROP POLICY IF EXISTS "Authenticated users can read ingestion runs" ON leila_ingestion_runs;
CREATE POLICY "Authenticated users can read ingestion runs"
  ON leila_ingestion_runs FOR SELECT TO authenticated USING (true);
