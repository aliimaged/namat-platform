-- Users and favorites (shared schema for passport and platform-renders)
-- Run once against your Neon database (e.g. via Neon SQL Editor or psql).

CREATE TABLE IF NOT EXISTS users (
  email         TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sign_up_source TEXT NOT NULL DEFAULT 'passport_download'
);

CREATE TABLE IF NOT EXISTS favorites (
  user_email TEXT NOT NULL,
  s3_key     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_email, s3_key)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_email ON favorites (user_email);
