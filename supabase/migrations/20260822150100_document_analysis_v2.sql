-- Pipeline de leitura documental v2: múltiplos documentos por imóvel (edital,
-- matrícula, laudo), ônus classificados por responsável de pagamento, conflitos
-- entre documentos e progresso em estágios para a UI. Tudo aditivo.

ALTER TABLE public.leila_document_analyses
  ADD COLUMN IF NOT EXISTS liabilities JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS payment_rules JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS conflicts JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS documents_read JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS stage TEXT,
  ADD COLUMN IF NOT EXISTS stage_detail TEXT,
  ADD COLUMN IF NOT EXISTS total_arrematante_brl NUMERIC(14,2);

-- prompt_version já existe com default 'document-v1'; v2 é setado pelo código
-- a partir de agora, sem precisar mudar o default da coluna.
