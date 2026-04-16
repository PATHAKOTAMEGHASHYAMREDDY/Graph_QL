-- Add password authentication for students
-- This allows students to login with email and password

-- Add password_hash column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Create student_refresh_tokens table for session management
CREATE TABLE IF NOT EXISTS student_refresh_tokens (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_address TEXT
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_student_refresh_tokens_student_id ON student_refresh_tokens(student_id);
CREATE INDEX IF NOT EXISTS idx_student_refresh_tokens_token ON student_refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_student_refresh_tokens_expires_at ON student_refresh_tokens(expires_at);

-- Make email unique for students (if not already)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
  END IF;
END $$;
