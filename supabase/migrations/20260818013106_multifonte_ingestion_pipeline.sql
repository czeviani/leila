-- Leila multi-source ingestion pipeline.
-- Keeps the existing property contract while adding source lifecycle,
-- execution leases, batch provenance and seller attribution.

ALTER TABLE public.leila_sources
  ADD COLUMN IF NOT EXISTS implementation_status TEXT NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'official',
  ADD COLUMN IF NOT EXISTS coverage_mode TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS covered_by_source_id TEXT REFERENCES public.leila_sources(id),
  ADD COLUMN IF NOT EXISTS requires_external_service BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_successful_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_status TEXT,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_found_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_written_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coverage_notes TEXT,
  ADD COLUMN IF NOT EXISTS collector_version TEXT;

ALTER TABLE public.leila_sources
  DROP CONSTRAINT IF EXISTS leila_sources_implementation_status_check,
  DROP CONSTRAINT IF EXISTS leila_sources_source_kind_check,
  DROP CONSTRAINT IF EXISTS leila_sources_coverage_mode_check,
  DROP CONSTRAINT IF EXISTS leila_sources_active_ready_check;

ALTER TABLE public.leila_sources
  ADD CONSTRAINT leila_sources_implementation_status_check
    CHECK (implementation_status IN ('planned', 'testing', 'ready', 'blocked', 'deprecated')),
  ADD CONSTRAINT leila_sources_source_kind_check
    CHECK (source_kind IN ('official', 'auctioneer', 'aggregator', 'coverage_target')),
  ADD CONSTRAINT leila_sources_coverage_mode_check
    CHECK (coverage_mode IN ('direct', 'indirect', 'none'));

-- Existing rows are explicitly classified. The old seed had BB and Santander
-- active in some environments despite having no executable adapter.
UPDATE public.leila_sources
SET implementation_status = CASE WHEN id = 'caixa' THEN 'ready' WHEN id = 'bb' THEN 'blocked' ELSE 'planned' END,
    source_kind = CASE WHEN id = 'caixa' THEN 'official' ELSE 'coverage_target' END,
    coverage_mode = CASE WHEN id = 'caixa' THEN 'direct' ELSE 'none' END,
    active = CASE WHEN id = 'caixa' THEN TRUE ELSE FALSE END,
    requires_external_service = FALSE,
    last_successful_at = COALESCE(last_successful_at, last_scraped_at),
    updated_at = NOW()
WHERE id IN ('caixa', 'bb', 'santander');

-- Any legacy source that was active without a validated collector must be
-- visible in the catalog but inactive. This makes the guard safe even when a
-- deployment has additional old seed rows beyond the three original ones.
UPDATE public.leila_sources
SET active = FALSE,
    updated_at = NOW()
WHERE active = TRUE
  AND implementation_status <> 'ready';

ALTER TABLE public.leila_sources
  ADD CONSTRAINT leila_sources_active_ready_check
    CHECK (NOT active OR implementation_status = 'ready');

INSERT INTO public.leila_sources (id, name, url, icon_url, active, scraper_key, implementation_status, source_kind, coverage_mode, requires_external_service, coverage_notes)
VALUES
  ('mega_leiloes', 'Mega Leilões', 'https://www.megaleiloes.com.br', NULL, FALSE, 'mega_leiloes', 'testing', 'aggregator', 'direct', FALSE, 'Spike público aprovado tecnicamente; aguardando três rodadas válidas antes de ativar. Pode cobrir vendedores como Santander, Itaú e Bradesco de forma indireta.'),
  ('itau', 'Itaú', 'https://www.itau.com.br', NULL, FALSE, 'itau', 'planned', 'coverage_target', 'none', FALSE, 'Pode receber cobertura indireta por leiloeiro; sem coletor direto validado.'),
  ('bradesco', 'Bradesco', 'https://banco.bradesco/html/classic/portal-investimentos/imoveis/index.shtm', NULL, FALSE, 'bradesco', 'planned', 'coverage_target', 'none', FALSE, 'Pode receber cobertura indireta por leiloeiro; sem coletor direto validado.'),
  ('zuk', 'Zuk', 'https://www.portalzuk.com.br', NULL, FALSE, 'zuk', 'planned', 'auctioneer', 'none', FALSE, 'Fonte posterior; não participa da rodada até passar por spike e três coletas válidas.'),
  ('sold', 'Sold', 'https://www.sold.com.br', NULL, FALSE, 'sold', 'planned', 'auctioneer', 'none', FALSE, 'Fonte posterior; não participa da rodada até passar por spike e três coletas válidas.'),
  ('superbid', 'Superbid', 'https://www.superbid.net', NULL, FALSE, 'superbid', 'planned', 'auctioneer', 'none', FALSE, 'Fonte posterior; não participa da rodada até passar por spike e três coletas válidas.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  scraper_key = EXCLUDED.scraper_key,
  implementation_status = CASE
    WHEN public.leila_sources.implementation_status = 'ready'
      THEN public.leila_sources.implementation_status
    ELSE EXCLUDED.implementation_status
  END,
  source_kind = EXCLUDED.source_kind,
  coverage_mode = CASE
    WHEN public.leila_sources.implementation_status = 'ready'
      THEN public.leila_sources.coverage_mode
    ELSE EXCLUDED.coverage_mode
  END,
  requires_external_service = EXCLUDED.requires_external_service,
  coverage_notes = EXCLUDED.coverage_notes,
  updated_at = NOW();

ALTER TABLE public.leila_sources
  DROP CONSTRAINT IF EXISTS leila_sources_indirect_coverage_check;

ALTER TABLE public.leila_sources
  ADD CONSTRAINT leila_sources_indirect_coverage_check
    CHECK (coverage_mode <> 'indirect' OR covered_by_source_id IS NOT NULL);

ALTER TABLE public.leila_properties
  ADD COLUMN IF NOT EXISTS seller_id TEXT REFERENCES public.leila_sources(id),
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_leila_properties_content_hash
  ON public.leila_properties(source_id, content_hash);

ALTER TABLE public.leila_ingestion_runs
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unchanged_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS collector_version TEXT;

ALTER TABLE public.leila_ingestion_runs
  DROP CONSTRAINT IF EXISTS leila_ingestion_runs_status_check;

ALTER TABLE public.leila_ingestion_runs
  ADD CONSTRAINT leila_ingestion_runs_status_check
    CHECK (status IN ('running', 'success', 'partial', 'failed', 'stale', 'cancelled', 'skipped'));

ALTER TABLE public.leila_ingestion_runs
  ALTER COLUMN heartbeat_at SET DEFAULT NOW();

UPDATE public.leila_ingestion_runs
SET heartbeat_at = COALESCE(heartbeat_at, started_at)
WHERE heartbeat_at IS NULL;

-- The old pipeline could leave multiple Caixa runs open. Preserve the newest
-- one and explicitly close older abandoned leases before adding the guard.
WITH ranked_running AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY started_at DESC, id DESC) AS position
  FROM public.leila_ingestion_runs
  WHERE status = 'running'
)
UPDATE public.leila_ingestion_runs run
SET status = 'stale',
    finished_at = COALESCE(finished_at, NOW()),
    diagnostics = COALESCE(diagnostics, '{}'::jsonb) || jsonb_build_object('reason', 'duplicate_running_lease_repaired'),
    heartbeat_at = NOW()
FROM ranked_running ranked
WHERE run.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leila_ingestion_one_running_per_source
  ON public.leila_ingestion_runs(source_id)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_leila_ingestion_runs_heartbeat
  ON public.leila_ingestion_runs(status, heartbeat_at);

CREATE TABLE IF NOT EXISTS public.leila_ingestion_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.leila_ingestion_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES public.leila_sources(id),
  external_id TEXT NOT NULL,
  region TEXT,
  normalized_data JSONB NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}',
  content_hash TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, source_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_leila_ingestion_items_run
  ON public.leila_ingestion_items(run_id, source_id);

CREATE TABLE IF NOT EXISTS public.leila_property_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.leila_properties(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.leila_ingestion_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES public.leila_sources(id),
  content_hash TEXT NOT NULL,
  snapshot_data JSONB NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_leila_property_snapshots_property
  ON public.leila_property_snapshots(property_id, observed_at DESC);

ALTER TABLE public.leila_ingestion_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leila_property_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.leila_ingestion_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.leila_property_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leila_ingestion_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leila_property_snapshots TO service_role;

REVOKE ALL ON FUNCTION public.leila_reconcile_missing(TEXT, TEXT[], TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leila_reconcile_missing(TEXT, TEXT[], TIMESTAMPTZ) TO service_role;

-- Repair source metadata after the migration. A source's successful timestamp
-- is never advanced by a partial or failed run.
UPDATE public.leila_sources source
SET last_successful_at = COALESCE(source.last_successful_at, source.last_scraped_at),
    last_attempted_at = COALESCE(source.last_attempted_at, source.last_scraped_at),
    last_status = CASE WHEN source.last_scraped_at IS NOT NULL THEN 'success' ELSE source.last_status END,
    updated_at = NOW();
