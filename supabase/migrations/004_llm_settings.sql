-- LLM provider/model settings per user
CREATE TABLE IF NOT EXISTS leila_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE,
  llm_provider TEXT NOT NULL DEFAULT 'anthropic',
  llm_model    TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leila_settings_user ON leila_settings(user_id);
