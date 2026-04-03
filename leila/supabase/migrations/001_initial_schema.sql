-- Leila — Initial Schema
-- Migration 001

-- ============================================================
-- leila_sources: fontes de leilão (Caixa, BB, Santander, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS leila_sources (
  id           TEXT PRIMARY KEY,        -- slug: 'caixa', 'bb', 'santander'
  name         TEXT NOT NULL,
  url          TEXT NOT NULL,
  icon_url     TEXT,
  active       BOOLEAN DEFAULT false,
  scraper_key  TEXT NOT NULL,           -- identifier usado pelo serviço Python
  last_scraped_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: fontes iniciais
INSERT INTO leila_sources (id, name, url, icon_url, active, scraper_key) VALUES
  ('caixa',    'Caixa Econômica Federal', 'https://venda-imoveis.caixa.gov.br', null, true,  'caixa'),
  ('bb',       'Banco do Brasil',         'https://www.brasilmais.com.br',       null, false, 'bb'),
  ('santander','Santander',               'https://www.santander.com.br/leiloes', null, false, 'santander')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- leila_properties: imóveis raspados
-- ============================================================
CREATE TABLE IF NOT EXISTS leila_properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       TEXT NOT NULL REFERENCES leila_sources(id),
  external_id     TEXT NOT NULL,           -- ID original na fonte
  title           TEXT NOT NULL,
  address         TEXT,
  city            TEXT,
  state           CHAR(2),                 -- UF: SP, RJ, MG...
  zip_code        TEXT,
  property_type   TEXT,                    -- apartamento, casa, terreno, comercial
  area_m2         DECIMAL(10,2),
  appraised_value DECIMAL(14,2),
  auction_price   DECIMAL(14,2) NOT NULL,
  discount_pct    DECIMAL(5,2),            -- % de desconto sobre valor de avaliação
  description     TEXT,
  edital_url      TEXT,                    -- link do edital PDF
  photos          TEXT[],                  -- array de URLs
  auction_date    DATE,
  auction_status  TEXT DEFAULT 'active',   -- active, sold, cancelled
  raw_data        JSONB,                   -- dados brutos do scraper
  scraped_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, external_id)
);

CREATE INDEX idx_leila_properties_state   ON leila_properties(state);
CREATE INDEX idx_leila_properties_city    ON leila_properties(city);
CREATE INDEX idx_leila_properties_type    ON leila_properties(property_type);
CREATE INDEX idx_leila_properties_price   ON leila_properties(auction_price);
CREATE INDEX idx_leila_properties_source  ON leila_properties(source_id);
CREATE INDEX idx_leila_properties_scraped ON leila_properties(scraped_at DESC);

-- ============================================================
-- leila_filters: configuração de pré-filtro por usuário
-- ============================================================
CREATE TABLE IF NOT EXISTS leila_filters (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL UNIQUE,
  price_min      DECIMAL(14,2),
  price_max      DECIMAL(14,2),
  states         TEXT[],                  -- ex: ['SP', 'RJ']
  cities         TEXT[],
  property_types TEXT[],                  -- ex: ['apartamento', 'casa']
  discount_min   DECIMAL(5,2),            -- desconto mínimo %
  active         BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- leila_favorites: imóveis favoritados pelo usuário
-- ============================================================
CREATE TABLE IF NOT EXISTS leila_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  property_id UUID NOT NULL REFERENCES leila_properties(id) ON DELETE CASCADE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, property_id)
);

CREATE INDEX idx_leila_favorites_user ON leila_favorites(user_id);

-- ============================================================
-- leila_evaluations: avaliações IA dos imóveis
-- ============================================================
CREATE TABLE IF NOT EXISTS leila_evaluations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      UUID NOT NULL REFERENCES leila_properties(id) ON DELETE CASCADE UNIQUE,
  status           TEXT DEFAULT 'pending',  -- pending, processing, done, error
  score            DECIMAL(3,1),            -- 0.0 a 10.0
  recommendation   TEXT,                    -- strong_buy, consider, risky, avoid
  summary          TEXT,
  location_notes   TEXT,
  condition_notes  TEXT,
  documents_notes  TEXT,
  risks            TEXT[],
  highlights       TEXT[],
  evaluated_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leila_evaluations_property ON leila_evaluations(property_id);
CREATE INDEX idx_leila_evaluations_score    ON leila_evaluations(score DESC);
