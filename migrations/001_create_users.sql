CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text UNIQUE,
  password text,
  role text DEFAULT 'EMP',
  rm_id uuid NULL REFERENCES users(id)
);
