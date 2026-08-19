-- Separate the price available in the current stage from the lowest official
-- price already known to the investor. auction_price remains the strategic
-- price used by filters, ranking and R$/m².
ALTER TABLE public.leila_properties
  ADD COLUMN IF NOT EXISTS current_stage_price NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS current_stage_date DATE,
  ADD COLUMN IF NOT EXISTS target_stage TEXT,
  ADD COLUMN IF NOT EXISTS journey_confidence TEXT NOT NULL DEFAULT 'observed';

ALTER TABLE public.leila_properties
  DROP CONSTRAINT IF EXISTS leila_properties_journey_confidence_check;
ALTER TABLE public.leila_properties
  ADD CONSTRAINT leila_properties_journey_confidence_check
  CHECK (journey_confidence IN ('official', 'observed', 'partial', 'unknown'));

-- Preserve the current value before auction_price is changed to the best
-- confirmed future minimum.
UPDATE public.leila_properties
SET current_stage_price = auction_price,
    current_stage_date = auction_date
WHERE current_stage_price IS NULL;

-- Existing multi-stage Caixa records already contain official prices. Pick
-- the lowest confirmed one, excluding possible/unpriced future modalities.
WITH strategic AS (
  SELECT property.id,
         priced.stage AS target_stage,
         priced.price AS strategic_price
  FROM public.leila_properties property
  CROSS JOIN LATERAL (
    SELECT item->>'stage' AS stage,
           (item->>'price')::NUMERIC AS price
    FROM jsonb_array_elements(property.auction_stages) item
    WHERE item->>'price' IS NOT NULL
    ORDER BY (item->>'price')::NUMERIC ASC
    LIMIT 1
  ) priced
  WHERE property.source_id = 'caixa'
)
UPDATE public.leila_properties property
SET auction_price = strategic.strategic_price,
    target_stage = strategic.target_stage,
    discount_pct = CASE
      WHEN property.appraised_value > 0
      THEN ROUND((1 - strategic.strategic_price / property.appraised_value) * 100, 2)
      ELSE property.discount_pct
    END,
    journey_confidence = CASE
      WHEN property.auction_stage IN ('first', 'second') THEN 'official'
      ELSE property.journey_confidence
    END,
    updated_at = NOW()
FROM strategic
WHERE property.id = strategic.id;

-- Every other active listing is at least a truthful single observed stage.
UPDATE public.leila_properties
SET auction_stage = COALESCE(NULLIF(auction_stage, 'unknown'), 'single'),
    target_stage = COALESCE(target_stage, NULLIF(auction_stage, 'unknown'), 'single'),
    auction_stages = jsonb_build_array(jsonb_build_object(
      'stage', COALESCE(NULLIF(auction_stage, 'unknown'), 'single'),
      'label', CASE auction_modality
        WHEN 'compra_direta' THEN 'Compra direta'
        WHEN 'primeira_praca' THEN '1ª praça'
        WHEN 'segunda_praca' THEN '2ª praça'
        WHEN 'leilao_online' THEN 'Leilão online'
        WHEN 'proposta_fechada' THEN 'Proposta fechada'
        ELSE 'Oferta atual'
      END,
      'sequence', 1,
      'price', auction_price,
      'event_at', auction_date,
      'status', 'current',
      'certainty', 'observed'
    )),
    journey_confidence = 'observed',
    updated_at = NOW()
WHERE jsonb_array_length(auction_stages) = 0
  AND COALESCE(raw_data->>'modalidade de venda', '') NOT ILIKE '%Leilão SFI%';

UPDATE public.leila_properties
SET auction_stage = 'unknown',
    target_stage = NULL,
    auction_stages = '[]'::JSONB,
    journey_confidence = 'partial',
    updated_at = NOW()
WHERE source_id = 'caixa'
  AND COALESCE(raw_data->>'modalidade de venda', '') ILIKE '%Leilão SFI%'
  AND journey_confidence <> 'official';

CREATE INDEX IF NOT EXISTS idx_leila_properties_target_stage
  ON public.leila_properties(source_id, target_stage)
  WHERE is_active = TRUE;
