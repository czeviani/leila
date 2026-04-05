-- Modalidade de leilão nos imóveis (compra_direta, leilao_online, leilao, proposta_fechada)
ALTER TABLE leila_properties
  ADD COLUMN IF NOT EXISTS auction_modality TEXT;

-- Classificação da área na avaliação IA (nobre, intermediário, popular, comunidade, indefinido)
ALTER TABLE leila_evaluations
  ADD COLUMN IF NOT EXISTS area_classification TEXT;

-- Preferência de modalidades nas configurações do usuário
ALTER TABLE leila_filters
  ADD COLUMN IF NOT EXISTS modality_categories TEXT[] DEFAULT '{}';
