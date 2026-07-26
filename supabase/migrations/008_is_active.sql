-- Migration 008: is_active — marca imóveis que saíram do CSV da fonte como inativos
-- O scraper seta is_active=true em todo upsert e, após cada rodada,
-- desativa imóveis cuja scraped_at < início da rodada (não foram vistos).

ALTER TABLE leila_properties ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_leila_properties_is_active
  ON leila_properties(is_active)
  WHERE is_active = TRUE;

-- Todos os existentes permanecem ativos (são do último scrape disponível)
UPDATE leila_properties SET is_active = TRUE WHERE is_active IS DISTINCT FROM TRUE;
