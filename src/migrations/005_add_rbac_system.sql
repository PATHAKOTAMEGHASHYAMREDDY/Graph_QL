-- ═══════════════════════════════════════════════════════════════════════════
-- RBAC (Role-Based Access Control) Implementation
-- ═══════════════════════════════════════════════════════════════════════════

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  resource VARCHAR(50) NOT NULL,  -- e.g., 'students', 'marks', 'documents'
  action VARCHAR(50) NOT NULL,     -- e.g., 'create', 'read', 'update', 'delete'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create role_permissions mapping table (many-to-many)
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role_id, permission_id)
);

-- Insert default roles FIRST
INSERT INTO roles (id, name, description) VALUES
  (1, 'admin', 'System administrator with full access'),
  (2, 'faculty', 'Faculty member who can manage students and marks'),
  (3, 'student', 'Student who can view their own data')
ON CONFLICT (name) DO NOTHING;

-- Reset sequence to avoid conflicts
SELECT setval('roles_id_seq', (SELECT MAX(id) FROM roles));

-- NOW add role_id columns with foreign keys
ALTER TABLE faculty ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) DEFAULT 2;

-- Add role_id to users (students) table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) DEFAULT 3;

-- Insert permissions
INSERT INTO permissions (name, description, resource, action) VALUES
  -- Student management permissions
  ('students.create', 'Create new students', 'students', 'create'),
  ('students.read', 'View student information', 'students', 'read'),
  ('students.update', 'Update student information', 'students', 'update'),
  ('students.delete', 'Delete students', 'students', 'delete'),
  ('students.read.own', 'View own student information', 'students', 'read'),
  
  -- Marks management permissions
  ('marks.create', 'Add marks for students', 'marks', 'create'),
  ('marks.read', 'View student marks', 'marks', 'read'),
  ('marks.update', 'Update student marks', 'marks', 'update'),
  ('marks.delete', 'Delete student marks', 'marks', 'delete'),
  ('marks.read.own', 'View own marks', 'marks', 'read'),
  
  -- Document management permissions
  ('documents.create', 'Upload documents', 'documents', 'create'),
  ('documents.read', 'View documents', 'documents', 'read'),
  ('documents.update', 'Update documents', 'documents', 'update'),
  ('documents.delete', 'Delete documents', 'documents', 'delete'),
  ('documents.read.own', 'View own documents', 'documents', 'read'),
  
  -- Faculty management permissions
  ('faculty.create', 'Create faculty accounts', 'faculty', 'create'),
  ('faculty.read', 'View faculty information', 'faculty', 'read'),
  ('faculty.update', 'Update faculty information', 'faculty', 'update'),
  ('faculty.delete', 'Delete faculty accounts', 'faculty', 'delete'),
  
  -- System permissions
  ('system.manage', 'Manage system settings', 'system', 'manage'),
  ('reports.generate', 'Generate reports', 'reports', 'generate')
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to Admin role (full access)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign permissions to Faculty role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE name IN (
  'students.create',
  'students.read',
  'students.update',
  'students.delete',
  'marks.create',
  'marks.read',
  'marks.update',
  'marks.delete',
  'documents.create',
  'documents.read',
  'documents.update',
  'documents.delete',
  'reports.generate'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign permissions to Student role (read-only for own data)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE name IN (
  'students.read.own',
  'marks.read.own',
  'documents.read.own'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_faculty_role_id ON faculty(role_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- Update existing faculty to have faculty role
UPDATE faculty SET role_id = 2 WHERE role_id IS NULL;

-- Update existing students to have student role
UPDATE users SET role_id = 3 WHERE role_id IS NULL;
