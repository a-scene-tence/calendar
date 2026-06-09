ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS hidden_categories jsonb;
