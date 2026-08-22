-- Proveniência e bloqueios de decisão para diligência de imóveis.
-- Tudo é aditivo para preservar avaliações e análises já existentes.

ALTER TABLE public.leila_document_analyses
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'official_listing',
  ADD COLUMN IF NOT EXISTS source_snapshot JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS identity_match TEXT NOT NULL DEFAULT 'not_checked',
  ADD COLUMN IF NOT EXISTS identity_evidence JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS completeness_score SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocking_issues TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS decision_status TEXT NOT NULL DEFAULT 'pending_diligence';

ALTER TABLE public.leila_document_analyses
  DROP CONSTRAINT IF EXISTS leila_document_analyses_identity_match_check;
ALTER TABLE public.leila_document_analyses
  ADD CONSTRAINT leila_document_analyses_identity_match_check
  CHECK (identity_match IN ('matched', 'partial', 'mismatch', 'not_checked'));

ALTER TABLE public.leila_document_analyses
  DROP CONSTRAINT IF EXISTS leila_document_analyses_completeness_score_check;
ALTER TABLE public.leila_document_analyses
  ADD CONSTRAINT leila_document_analyses_completeness_score_check
  CHECK (completeness_score BETWEEN 0 AND 100);

ALTER TABLE public.leila_document_analyses
  DROP CONSTRAINT IF EXISTS leila_document_analyses_decision_status_check;
ALTER TABLE public.leila_document_analyses
  ADD CONSTRAINT leila_document_analyses_decision_status_check
  CHECK (decision_status IN ('ready_for_final_review', 'pending_diligence', 'blocked'));

ALTER TABLE public.leila_evaluations
  ADD COLUMN IF NOT EXISTS input_snapshot JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS evidence_snapshot JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS decision_status TEXT NOT NULL DEFAULT 'pending_diligence',
  ADD COLUMN IF NOT EXISTS blocking_issues TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS model_version TEXT;

ALTER TABLE public.leila_evaluations
  DROP CONSTRAINT IF EXISTS leila_evaluations_decision_status_check;
ALTER TABLE public.leila_evaluations
  ADD CONSTRAINT leila_evaluations_decision_status_check
  CHECK (decision_status IN ('ready_for_final_review', 'pending_diligence', 'blocked'));

CREATE TABLE IF NOT EXISTS public.leila_property_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.leila_properties(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('listing', 'edital', 'attachment', 'errata', 'matricula', 'laudo', 'certificate', 'unknown')),
  source_url TEXT NOT NULL,
  source_host TEXT,
  content_hash TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  http_status INTEGER,
  content_type TEXT,
  page_count INTEGER,
  identity_match TEXT NOT NULL DEFAULT 'not_checked' CHECK (identity_match IN ('matched', 'partial', 'mismatch', 'not_checked')),
  identity_evidence JSONB NOT NULL DEFAULT '[]',
  extracted_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, source_url, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_leila_property_documents_property
  ON public.leila_property_documents(property_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_leila_property_documents_current
  ON public.leila_property_documents(property_id, is_current)
  WHERE is_current = TRUE;

ALTER TABLE public.leila_property_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.leila_property_documents FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.leila_property_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leila_property_documents TO service_role;

DROP POLICY IF EXISTS "Authenticated users can read property documents" ON public.leila_property_documents;
CREATE POLICY "Authenticated users can read property documents"
  ON public.leila_property_documents FOR SELECT TO authenticated USING (TRUE);

COMMENT ON TABLE public.leila_property_documents IS 'Snapshots documentais com hash, identidade e evidências; ausência de confirmação não significa ausência de dívida.';
