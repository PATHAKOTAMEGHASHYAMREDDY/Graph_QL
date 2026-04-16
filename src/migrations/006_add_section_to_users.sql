-- Add section column to users (students) table
-- This links students to faculty by section (S01-S08)

ALTER TABLE users ADD COLUMN IF NOT EXISTS section VARCHAR(10);

-- Create index for faster section-based queries
CREATE INDEX IF NOT EXISTS idx_users_section ON users(section);
CREATE INDEX IF NOT EXISTS idx_faculty_class_section ON faculty(class_section);

-- Update existing students to have a default section (optional)
-- UPDATE users SET section = 'S01' WHERE section IS NULL;
