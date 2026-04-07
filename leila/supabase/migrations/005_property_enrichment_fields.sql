-- Migration 005: Campos de enriquecimento de imóveis
-- Extração heurística (camada 1) e IA batch (camada 2) durante scraping

ALTER TABLE leila_properties ADD COLUMN IF NOT EXISTS bedrooms SMALLINT;
ALTER TABLE leila_properties ADD COLUMN IF NOT EXISTS bathrooms SMALLINT;
ALTER TABLE leila_properties ADD COLUMN IF NOT EXISTS parking_spots SMALLINT;
ALTER TABLE leila_properties ADD COLUMN IF NOT EXISTS is_occupied BOOLEAN;
ALTER TABLE leila_properties ADD COLUMN IF NOT EXISTS property_condition TEXT
    CHECK (property_condition IN ('precario', 'habitavel', 'reformado', 'novo'));
ALTER TABLE leila_properties ADD COLUMN IF NOT EXISTS useful_area_m2 DECIMAL(10,2);
ALTER TABLE leila_properties ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}';
ALTER TABLE leila_properties ADD COLUMN IF NOT EXISTS ai_enriched_at TIMESTAMPTZ;

-- Índices para filtros comuns no frontend
CREATE INDEX IF NOT EXISTS idx_properties_bedrooms ON leila_properties(bedrooms);
CREATE INDEX IF NOT EXISTS idx_properties_condition ON leila_properties(property_condition);
CREATE INDEX IF NOT EXISTS idx_properties_occupied ON leila_properties(is_occupied);
CREATE INDEX IF NOT EXISTS idx_properties_ai_enriched ON leila_properties(ai_enriched_at) WHERE ai_enriched_at IS NULL;
