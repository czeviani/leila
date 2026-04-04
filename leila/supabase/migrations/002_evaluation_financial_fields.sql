-- Add financial analysis fields to evaluations
ALTER TABLE leila_evaluations
  ADD COLUMN IF NOT EXISTS price_per_m2 DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS financial_data JSONB;
