-- Create refresh_tokens table for session management
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  faculty_id INTEGER NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_address TEXT
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_faculty_id ON refresh_tokens(faculty_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Clean up expired tokens periodically (optional, can be run as a cron job)
-- DELETE FROM refresh_tokens WHERE expires_at < NOW();
