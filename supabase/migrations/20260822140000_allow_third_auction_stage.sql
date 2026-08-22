-- Leilões judiciais com 3ª praça já existem no catálogo (raro, mas legítimo).
-- O check constraint só aceitava 'first'/'second'/'single'/'unknown', então
-- qualquer imóvel com estágio "third" derrubava o lote inteiro do upsert.
ALTER TABLE public.leila_properties
  DROP CONSTRAINT IF EXISTS leila_properties_auction_stage_check;
ALTER TABLE public.leila_properties
  ADD CONSTRAINT leila_properties_auction_stage_check
  CHECK (auction_stage IS NULL OR auction_stage IN ('first', 'second', 'third', 'single', 'unknown'));
