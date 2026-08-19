ALTER TABLE public.leila_properties
  ADD COLUMN IF NOT EXISTS auction_stage TEXT,
  ADD COLUMN IF NOT EXISTS auction_stages JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE public.leila_properties
  DROP CONSTRAINT IF EXISTS leila_properties_auction_stage_check;
ALTER TABLE public.leila_properties
  ADD CONSTRAINT leila_properties_auction_stage_check
  CHECK (auction_stage IS NULL OR auction_stage IN ('first', 'second', 'single', 'unknown'));

-- Caixa used the property page in the legacy edital field. Preserve the
-- direct link after separating listing pages from downloadable documents.
UPDATE public.leila_properties
SET listing_url = edital_url,
    updated_at = NOW()
WHERE listing_url IS NULL
  AND edital_url IS NOT NULL
  AND edital_url !~* '\\.(pdf|docx?)(?:[?#]|$)';
