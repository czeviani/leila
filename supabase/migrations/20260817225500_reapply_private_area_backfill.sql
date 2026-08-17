-- Uma coleta iniciada antes do deploy do parser corrigido podia concluir depois
-- do primeiro backfill. Esta passada idempotente remove essa condição de corrida;
-- as coletas seguintes já persistem área privativa corretamente na origem.

WITH extracted AS (
  SELECT
    id,
    replace(
      (regexp_match(
        description,
        '([0-9]+[.,][0-9]+)[[:space:]]*(m²|m2)?[[:space:]]*de[[:space:]]+área[[:space:]]+privativa',
        'i'
      ))[1],
      ',', '.'
    )::NUMERIC AS private_area
  FROM public.leila_properties
  WHERE description ~* 'área[[:space:]]+privativa'
)
UPDATE public.leila_properties property
SET useful_area_m2 = extracted.private_area,
    updated_at = NOW()
FROM extracted
WHERE property.id = extracted.id
  AND extracted.private_area >= 5
  AND property.useful_area_m2 IS DISTINCT FROM extracted.private_area;

SELECT public.leila_refresh_neighborhood_profiles('{}'::TEXT[]);
