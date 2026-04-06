-- Migration 006: Backfill enrichment fields from description text
-- Parses the Caixa description format: "Apartamento, 0.00 de área total, 47.20 de área privativa,
-- 0.00 de área do terreno, 2 qto(s), a.serv, WC, 1 sala(s), cozinha, 1 vaga(s) de garagem."

-- ── bedrooms: matches "2 qto(s)" or "2 quartos" or "2 dorms" ──────────────
UPDATE leila_properties
SET bedrooms = (
  regexp_match(
    description,
    '(\d+)\s*(?:qto|quarto|dorm|dormitório)s?\(?s?\)?',
    'i'
  )
)[1]::smallint
WHERE description IS NOT NULL
  AND bedrooms IS NULL
  AND regexp_match(description, '(\d+)\s*(?:qto|quarto|dorm|dormitório)s?\(?s?\)?', 'i') IS NOT NULL;

-- ── bathrooms: matches "1 WC" or "2 banheiros" or standalone "WC" → 1 ──────
-- First pass: explicit number before wc/banheiro
UPDATE leila_properties
SET bathrooms = (
  regexp_match(
    description,
    '(\d+)\s*(?:banheiro|wc|lavabo|sanitário|toalete)s?',
    'i'
  )
)[1]::smallint
WHERE description IS NOT NULL
  AND bathrooms IS NULL
  AND regexp_match(description, '(\d+)\s*(?:banheiro|wc|lavabo|sanitário|toalete)s?', 'i') IS NOT NULL;

-- Second pass: standalone "WC" (no number prefix) → assume 1 bathroom
UPDATE leila_properties
SET bathrooms = 1
WHERE description IS NOT NULL
  AND bathrooms IS NULL
  AND description ~* '(?:^|,\s*|\s)wc(?:\s*,|\s*$)';

-- ── parking_spots: matches "1 vaga(s) de garagem" or "2 garagens" ──────────
UPDATE leila_properties
SET parking_spots = (
  regexp_match(
    description,
    '(\d+)\s*vagas?\(?s?\)?\s*(?:de\s*)?(?:garagem|estacionamento)?',
    'i'
  )
)[1]::smallint
WHERE description IS NOT NULL
  AND parking_spots IS NULL
  AND regexp_match(description, '(\d+)\s*vagas?\(?s?\)?\s*(?:de\s*)?(?:garagem|estacionamento)?', 'i') IS NOT NULL;

-- ── useful_area_m2: matches "47.20 de área privativa" ──────────────────────
UPDATE leila_properties
SET useful_area_m2 = replace(
  (regexp_match(
    description,
    '(\d+[.,]\d+)\s*(?:m[²2])?\s*de\s*área\s*(?:útil|privativa?|construída?)',
    'i'
  ))[1],
  ',', '.'
)::numeric
WHERE description IS NOT NULL
  AND useful_area_m2 IS NULL
  AND regexp_match(description, '(\d+[.,]\d+)\s*(?:m[²2])?\s*de\s*área\s*(?:útil|privativa?|construída?)', 'i') IS NOT NULL;

-- Fallback: "área privativa, 47.20" format
UPDATE leila_properties
SET useful_area_m2 = replace(
  (regexp_match(
    description,
    '(?:área\s*privativa?|área\s*útil|área\s*construída?)[,\s]+(\d+[.,]\d+)',
    'i'
  ))[1],
  ',', '.'
)::numeric
WHERE description IS NOT NULL
  AND useful_area_m2 IS NULL
  AND regexp_match(description, '(?:área\s*privativa?|área\s*útil|área\s*construída?)[,\s]+(\d+[.,]\d+)', 'i') IS NOT NULL;

-- ── area_m2: use useful_area_m2 when area_m2 is null or 0 ─────────────────
UPDATE leila_properties
SET area_m2 = useful_area_m2
WHERE (area_m2 IS NULL OR area_m2 = 0)
  AND useful_area_m2 IS NOT NULL
  AND useful_area_m2 > 0;
