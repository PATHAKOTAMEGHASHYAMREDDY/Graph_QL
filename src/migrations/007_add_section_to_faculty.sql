-- Migration: Add section column to faculty table
-- This allows faculty to be assigned to specific sections (S01-S08)

-- Add section column to faculty table
ALTER TABLE faculty ADD COLUMN IF NOT EXISTS section VARCHAR(3);

-- Add check constraint to ensure section is one of S01-S08
ALTER TABLE faculty DROP CONSTRAINT IF EXISTS faculty_section_check;
ALTER TABLE faculty ADD CONSTRAINT faculty_section_check 
  CHECK (section IN ('S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08'));

-- Create index on section for faster queries
CREATE INDEX IF NOT EXISTS idx_faculty_section ON faculty(section);

-- Update existing faculty records to have a default section (if any exist)
-- This is safe because we just cleaned the database
UPDATE faculty SET section = class_section WHERE section IS NULL AND class_section IS NOT NULL;

COMMENT ON COLUMN faculty.section IS 'Section assigned to faculty (S01-S08)';
