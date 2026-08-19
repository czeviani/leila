-- Keep the public property page separate from PDFs and other official
-- documents. `edital_url` remains the document used by document analysis.
ALTER TABLE public.leila_properties
  ADD COLUMN IF NOT EXISTS listing_url TEXT;

UPDATE public.leila_properties
SET listing_url = NULLIF(raw_data ->> 'source_url', ''),
    updated_at = NOW()
WHERE NULLIF(raw_data ->> 'source_url', '') IS NOT NULL
  AND listing_url IS DISTINCT FROM NULLIF(raw_data ->> 'source_url', '');
