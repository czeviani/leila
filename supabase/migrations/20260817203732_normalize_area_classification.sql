-- Normaliza cidades acentuadas/não acentuadas e evita inferir comunidade
-- somente por preço baixo. Essa categoria exige evidência textual explícita.
WITH property_base AS (
  SELECT
    id,
    extensions.unaccent(lower(trim(coalesce(city, '')))) AS normalized_city,
    extensions.unaccent(lower(trim(coalesce(address, '')))) AS normalized_address,
    CASE
      WHEN appraised_value IS NOT NULL AND filter_area_m2 > 0
        THEN appraised_value / filter_area_m2
      ELSE NULL
    END AS appraised_price_m2
  FROM public.leila_properties
), classified AS (
  SELECT
    id,
    CASE
      WHEN normalized_address LIKE ANY (ARRAY[
        '%favela%', '%comunidade %', '%morro do %', '%morro da %',
        '%ocupacao irregular%', '%cohab %', '%nucleo habitacional%',
        '%paraisopolis%', '%heliopolis%', '%rocinha%', '%complexo do alemao%'
      ]) THEN 'comunidade'
      WHEN appraised_price_m2 IS NULL THEN 'indefinido'
      WHEN normalized_city = ANY (ARRAY[
        'sao paulo','rio de janeiro','brasilia','curitiba','porto alegre',
        'florianopolis','campinas','santos','niteroi','sao bernardo do campo',
        'guarulhos','osasco','santo andre','sao caetano do sul','barueri',
        'alphaville','tambore'
      ]) THEN CASE
        WHEN appraised_price_m2 >= 9000 THEN 'nobre'
        WHEN appraised_price_m2 >= 4500 THEN 'intermediário'
        ELSE 'popular'
      END
      WHEN normalized_city = ANY (ARRAY[
        'belo horizonte','fortaleza','recife','salvador','manaus','belem',
        'goiania','natal','maceio','joao pessoa','teresina','aracaju',
        'campo grande','cuiaba','porto velho','macapa','boa vista','palmas',
        'vitoria','sao luis','londrina','maringa','joinville','blumenau',
        'caxias do sul','pelotas','uberlandia','ribeirao preto','sorocaba',
        'sao jose dos campos','mogi das cruzes','diadema'
      ]) THEN CASE
        WHEN appraised_price_m2 >= 5500 THEN 'nobre'
        WHEN appraised_price_m2 >= 2500 THEN 'intermediário'
        ELSE 'popular'
      END
      ELSE CASE
        WHEN appraised_price_m2 >= 3500 THEN 'nobre'
        WHEN appraised_price_m2 >= 1500 THEN 'intermediário'
        ELSE 'popular'
      END
    END AS classification
  FROM property_base
)
UPDATE public.leila_properties AS property
SET area_classification = classified.classification,
    updated_at = NOW()
FROM classified
WHERE property.id = classified.id
  AND property.area_classification IS DISTINCT FROM classified.classification;
