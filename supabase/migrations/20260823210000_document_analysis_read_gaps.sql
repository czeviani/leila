-- "O que não pôde ser lido": lista consolidada de tudo que ficou de fora da
-- leitura documental por falta de acesso ou restrição (documento não
-- encontrado, download bloqueado, formato ilegível). Antes disto, um
-- documento cujo download falhasse completamente (fetchDocument === null)
-- sumia em silêncio — nunca virava DocumentInput, então nunca aparecia em
-- documents_read. Aditivo.

ALTER TABLE public.leila_document_analyses
  ADD COLUMN IF NOT EXISTS read_gaps JSONB NOT NULL DEFAULT '[]';
