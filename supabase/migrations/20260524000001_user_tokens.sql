CREATE TABLE user_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_refresh_token text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_token" ON user_tokens
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
