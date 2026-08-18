-- Restrict the collection product to Sao Paulo capital and model indirect
-- coverage explicitly. Existing out-of-scope rows are retained for audit but
-- hidden by the backend through `in_scope`.

ALTER TABLE public.leila_sources
  ADD COLUMN IF NOT EXISTS target_state TEXT NOT NULL DEFAULT 'SP',
  ADD COLUMN IF NOT EXISTS target_city TEXT NOT NULL DEFAULT 'São Paulo';

ALTER TABLE public.leila_properties
  ADD COLUMN IF NOT EXISTS in_scope BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS canonical_key TEXT;

UPDATE public.leila_properties
SET in_scope = (
  UPPER(BTRIM(COALESCE(state, ''))) = 'SP'
  AND UPPER(TRANSLATE(
    BTRIM(COALESCE(city, '')),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
  )) = 'SAO PAULO'
);

UPDATE public.leila_properties
SET city = 'São Paulo'
WHERE in_scope = TRUE AND city IS DISTINCT FROM 'São Paulo';

CREATE INDEX IF NOT EXISTS idx_leila_properties_scope_live
  ON public.leila_properties(source_id, last_seen_at DESC)
  WHERE in_scope = TRUE AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_leila_properties_canonical_key
  ON public.leila_properties(canonical_key)
  WHERE canonical_key IS NOT NULL AND in_scope = TRUE;

ALTER TABLE public.leila_ingestion_runs
  ADD COLUMN IF NOT EXISTS scope_state TEXT NOT NULL DEFAULT 'SP',
  ADD COLUMN IF NOT EXISTS scope_city TEXT NOT NULL DEFAULT 'São Paulo';

ALTER TABLE public.leila_ingestion_items
  ADD COLUMN IF NOT EXISTS city TEXT;

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
      AND UPPER(TRANSLATE(
        BTRIM(COALESCE(city, '')),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
        'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
      )) = UPPER(TRANSLATE(
        BTRIM(p_scope_city),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
        'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
      ))
      AND COALESCE(last_seen_at, scraped_at) < p_scrape_start
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

CREATE TABLE IF NOT EXISTS public.leila_source_coverages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_source_id TEXT NOT NULL REFERENCES public.leila_sources(id) ON DELETE CASCADE,
  covered_source_id TEXT NOT NULL REFERENCES public.leila_sources(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL DEFAULT 'seller_attribution',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  observed_count INTEGER NOT NULL DEFAULT 0,
  last_observed_at TIMESTAMPTZ,
  evidence_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leila_source_coverages_not_self
    CHECK (collector_source_id <> covered_source_id),
  CONSTRAINT leila_source_coverages_strategy_check
    CHECK (strategy IN ('seller_attribution', 'marketplace_channel', 'official_redirect')),
  UNIQUE (collector_source_id, covered_source_id)
);

CREATE INDEX IF NOT EXISTS idx_leila_source_coverages_covered
  ON public.leila_source_coverages(covered_source_id, active);

ALTER TABLE public.leila_source_coverages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.leila_source_coverages FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.leila_source_coverages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leila_source_coverages TO service_role;

DROP POLICY IF EXISTS "Authenticated users read source coverage" ON public.leila_source_coverages;
CREATE POLICY "Authenticated users read source coverage"
  ON public.leila_source_coverages
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role manages source coverage" ON public.leila_source_coverages;
CREATE POLICY "Service role manages source coverage"
  ON public.leila_source_coverages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.leila_sources (
  id, name, url, active, scraper_key, implementation_status, source_kind,
  coverage_mode, requires_external_service, coverage_notes, collector_version,
  target_state, target_city
)
VALUES
  ('mega_leiloes', 'Mega Leilões', 'https://www.megaleiloes.com.br', TRUE, 'mega_leiloes', 'ready', 'aggregator', 'direct', FALSE,
   'Coleta direta do catálogo público, restrita a São Paulo/SP.', 'mega-leiloes-1.1.0', 'SP', 'São Paulo'),
  ('zuk', 'Zuk', 'https://www.portalzuk.com.br', TRUE, 'zuk', 'ready', 'auctioneer', 'direct', TRUE,
   'Coleta do catálogo de São Paulo/SP com fallback externo quando a origem bloquear o executor.', 'zuk-1.0.0', 'SP', 'São Paulo'),
  ('superbid', 'Superbid', 'https://www.superbid.net', TRUE, 'superbid', 'ready', 'aggregator', 'direct', FALSE,
   'Coleta estruturada das ofertas públicas de imóveis em São Paulo/SP, excluindo o canal SOLD.', 'superbid-1.0.0', 'SP', 'São Paulo'),
  ('sold', 'Sold', 'https://sold.superbid.net', TRUE, 'sold', 'ready', 'auctioneer', 'direct', FALSE,
   'Coleta das ofertas do canal SOLD publicadas na infraestrutura Superbid.', 'sold-1.0.0', 'SP', 'São Paulo')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  active = EXCLUDED.active,
  scraper_key = EXCLUDED.scraper_key,
  implementation_status = EXCLUDED.implementation_status,
  source_kind = EXCLUDED.source_kind,
  coverage_mode = EXCLUDED.coverage_mode,
  requires_external_service = EXCLUDED.requires_external_service,
  coverage_notes = EXCLUDED.coverage_notes,
  collector_version = EXCLUDED.collector_version,
  target_state = EXCLUDED.target_state,
  target_city = EXCLUDED.target_city,
  updated_at = NOW();

UPDATE public.leila_sources
SET target_state = 'SP',
    target_city = 'São Paulo',
    implementation_status = 'ready',
    coverage_mode = 'direct',
    active = TRUE,
    coverage_notes = 'CSV oficial do estado de SP filtrado para o município de São Paulo.',
    updated_at = NOW()
WHERE id = 'caixa';

UPDATE public.leila_sources
SET implementation_status = 'ready',
    source_kind = 'coverage_target',
    coverage_mode = 'indirect',
    covered_by_source_id = CASE id
      WHEN 'santander' THEN 'mega_leiloes'
      WHEN 'itau' THEN 'zuk'
      WHEN 'bradesco' THEN 'mega_leiloes'
      WHEN 'bb' THEN 'zuk'
    END,
    active = FALSE,
    requires_external_service = (id = 'bb'),
    last_status = CASE WHEN id = 'bb' THEN 'monitoring' ELSE last_status END,
    coverage_notes = CASE id
      WHEN 'santander' THEN 'Cobertura indireta quando o vendedor é identificado em Mega Leilões, Zuk, Superbid ou Sold.'
      WHEN 'itau' THEN 'Cobertura indireta quando o vendedor é identificado em Zuk, Mega Leilões, Superbid ou Sold.'
      WHEN 'bradesco' THEN 'Cobertura indireta quando o vendedor é identificado em Mega Leilões, Zuk, Superbid ou Sold.'
      WHEN 'bb' THEN 'Portal oficial monitorado; imóveis entram apenas quando um parceiro identifica explicitamente o Banco do Brasil como vendedor.'
    END,
    target_state = 'SP',
    target_city = 'São Paulo',
    updated_at = NOW()
WHERE id IN ('bb', 'santander', 'itau', 'bradesco');

INSERT INTO public.leila_source_coverages (
  collector_source_id, covered_source_id, strategy, active, evidence_notes
)
VALUES
  ('mega_leiloes', 'santander', 'seller_attribution', TRUE, 'Eventos e cartões identificam Santander explicitamente.'),
  ('mega_leiloes', 'itau', 'seller_attribution', TRUE, 'Eventos e cartões identificam Itaú explicitamente.'),
  ('mega_leiloes', 'bradesco', 'seller_attribution', TRUE, 'Eventos e cartões identificam Bradesco explicitamente.'),
  ('zuk', 'itau', 'seller_attribution', TRUE, 'O catálogo informa Itaú Unibanco S/A como comitente.'),
  ('zuk', 'bradesco', 'seller_attribution', TRUE, 'O catálogo informa Banco Bradesco S/A como comitente.'),
  ('zuk', 'bb', 'seller_attribution', TRUE, 'Somente anúncios com Banco do Brasil explicitamente identificado como vendedor.'),
  ('superbid', 'santander', 'seller_attribution', TRUE, 'Somente anúncios com Santander explicitamente identificado.'),
  ('superbid', 'itau', 'seller_attribution', TRUE, 'Somente anúncios com Itaú explicitamente identificado.'),
  ('superbid', 'bradesco', 'seller_attribution', TRUE, 'Somente anúncios com Bradesco explicitamente identificado.'),
  ('superbid', 'bb', 'seller_attribution', TRUE, 'Somente imóveis reais; cotas de consórcio são rejeitadas.'),
  ('sold', 'santander', 'seller_attribution', TRUE, 'Somente anúncios com Santander explicitamente identificado.'),
  ('sold', 'itau', 'seller_attribution', TRUE, 'Somente anúncios com Itaú explicitamente identificado.'),
  ('sold', 'bradesco', 'seller_attribution', TRUE, 'Somente anúncios com Bradesco explicitamente identificado.'),
  ('sold', 'bb', 'seller_attribution', TRUE, 'Somente imóveis reais; cotas de consórcio são rejeitadas.')
ON CONFLICT (collector_source_id, covered_source_id) DO UPDATE SET
  strategy = EXCLUDED.strategy,
  active = EXCLUDED.active,
  evidence_notes = EXCLUDED.evidence_notes,
  updated_at = NOW();
