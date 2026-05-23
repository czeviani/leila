-- Migration 007: heat_score — score de oportunidade composto por imóvel
-- Calculado automaticamente via trigger em INSERT/UPDATE
-- Critérios: desconto (35%), região sudeste (20%), modalidade (15%), área (15%), urgência (15%)

ALTER TABLE leila_properties ADD COLUMN IF NOT EXISTS heat_score numeric DEFAULT 0;

CREATE OR REPLACE FUNCTION leila_calc_heat_score(
  p_discount_pct   numeric,
  p_state          text,
  p_auction_modality text,
  p_area_classification text,
  p_auction_date   timestamptz
) RETURNS numeric AS $$
DECLARE
  score    numeric := 0;
  days_left integer;
BEGIN
  -- Desconto (35 pts max): 50% = máximo
  IF p_discount_pct IS NOT NULL THEN
    score := score + LEAST(p_discount_pct / 50.0, 1.0) * 35;
  END IF;

  -- Região Sudeste (20 pts)
  IF p_state IN ('SP', 'RJ', 'MG', 'ES') THEN
    score := score + 20;
  END IF;

  -- Modalidade (15 pts): 2ª praça é a mais vantajosa
  CASE p_auction_modality
    WHEN 'segunda_praca'    THEN score := score + 15;
    WHEN 'leilao_online'    THEN score := score + 10;
    WHEN 'compra_direta'    THEN score := score + 8;
    WHEN 'proposta_fechada' THEN score := score + 5;
    WHEN 'primeira_praca'   THEN score := score + 3;
    ELSE NULL;
  END CASE;

  -- Classificação de área (15 pts)
  CASE p_area_classification
    WHEN 'nobre'          THEN score := score + 15;
    WHEN 'intermediário'  THEN score := score + 10;
    WHEN 'popular'        THEN score := score + 5;
    ELSE NULL;
  END CASE;

  -- Urgência temporal (15 pts): leilão iminente = mais urgente
  IF p_auction_date IS NOT NULL THEN
    days_left := (p_auction_date::date - CURRENT_DATE);
    IF    days_left > 0 AND days_left <= 7  THEN score := score + 15;
    ELSIF days_left > 7 AND days_left <= 30 THEN score := score + 8;
    ELSIF days_left > 30                    THEN score := score + 3;
    END IF;
  END IF;

  RETURN ROUND(LEAST(score, 100), 1);
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger: recalcula ao inserir ou atualizar colunas relevantes
CREATE OR REPLACE FUNCTION leila_trg_heat_score() RETURNS TRIGGER AS $$
BEGIN
  NEW.heat_score := leila_calc_heat_score(
    NEW.discount_pct,
    NEW.state,
    NEW.auction_modality,
    NEW.area_classification,
    NEW.auction_date
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leila_heat_score ON leila_properties;
CREATE TRIGGER trg_leila_heat_score
  BEFORE INSERT OR UPDATE OF discount_pct, state, auction_modality, area_classification, auction_date
  ON leila_properties
  FOR EACH ROW EXECUTE FUNCTION leila_trg_heat_score();

-- Índice para sort por heat_score
CREATE INDEX IF NOT EXISTS idx_properties_heat_score ON leila_properties(heat_score DESC NULLS LAST);

-- Backfill em todos os imóveis existentes
UPDATE leila_properties
SET heat_score = leila_calc_heat_score(
  discount_pct, state, auction_modality, area_classification, auction_date
);
