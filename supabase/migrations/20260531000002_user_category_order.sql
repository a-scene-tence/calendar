ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS category_order jsonb;
