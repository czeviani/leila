-- Registro append-only de toda chamada de IA do projeto Leila (análise documental,
-- avaliação de investimento, enriquecimento do scraper). Existe porque
-- leila_document_analyses e leila_evaluations são UNIQUE(property_id): toda
-- re-análise sobrescreve os tokens da rodada anterior e o gasto acumulado se perde.
-- Este é o histórico que o "custo controlado" do painel deveria ter sido desde o início.

CREATE TABLE IF NOT EXISTS public.leila_ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.leila_properties(id) ON DELETE CASCADE,
  run_id UUID NOT NULL,
  feature TEXT NOT NULL CHECK (feature IN ('document_analysis', 'evaluation', 'scraper_enrichment')),
  stage TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cache_read_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cache_read_tokens >= 0),
  cache_write_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
  cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  cost_brl NUMERIC(12,4) NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_leila_ai_usage_events_property
  ON public.leila_ai_usage_events(property_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_leila_ai_usage_events_feature
  ON public.leila_ai_usage_events(feature, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_leila_ai_usage_events_run
  ON public.leila_ai_usage_events(run_id);

ALTER TABLE public.leila_ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.leila_ai_usage_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.leila_ai_usage_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leila_ai_usage_events TO service_role;

DROP POLICY IF EXISTS "Authenticated users can read ai usage events" ON public.leila_ai_usage_events;
CREATE POLICY "Authenticated users can read ai usage events"
  ON public.leila_ai_usage_events FOR SELECT TO authenticated USING (TRUE);

COMMENT ON TABLE public.leila_ai_usage_events IS 'Append-only: cada linha é uma chamada de IA já ocorrida. Nunca é atualizado, só inserido.';
