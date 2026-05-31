ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS google_access_token text,
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz;
