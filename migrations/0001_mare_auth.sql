CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at INTEGER NOT NULL
);

-- The first registered account is the only account that can ever receive admin.
-- The partial unique index is the database-level guard against a second admin.
CREATE UNIQUE INDEX IF NOT EXISTS users_single_admin
  ON users(role)
  WHERE role = 'admin';

CREATE INDEX IF NOT EXISTS users_created_at
  ON users(created_at);
