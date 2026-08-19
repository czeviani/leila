-- A modality that may be offered later is not part of the published journey
-- of the current lot. Keep only stages explicitly observed for that property.
UPDATE public.leila_properties property
SET auction_stages = cleaned.stages,
    updated_at = NOW()
FROM (
  SELECT id, COALESCE(jsonb_agg(stage ORDER BY COALESCE((stage->>'sequence')::INT, 999)), '[]'::JSONB) AS stages
  FROM public.leila_properties
  CROSS JOIN LATERAL jsonb_array_elements(auction_stages) stage
  WHERE COALESCE(stage->>'certainty', '') <> 'possible'
    AND COALESCE(stage->>'status', '') <> 'possible'
  GROUP BY id
) cleaned
WHERE property.id = cleaned.id
  AND property.auction_stages <> cleaned.stages;
