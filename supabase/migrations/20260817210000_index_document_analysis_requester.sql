-- Índice de apoio para a chave estrangeira de quem solicitou a análise.
CREATE INDEX IF NOT EXISTS idx_leila_document_analyses_requested_by
  ON public.leila_document_analyses(requested_by)
  WHERE requested_by IS NOT NULL;
