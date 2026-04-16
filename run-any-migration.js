/**
 * Run any database migration
 * Usage: node run-any-migration.js <migration-file-name>
 * Example: node run-any-migration.js 007_add_section_to_faculty.sql
 */

const fs = require('fs');
const path = require('path');
const db = require('./src/db');

async function runMigration() {
  try {
    const migrationFile = process.argv[2];
    
    if (!migrationFile) {
      console.error('❌ Please provide a migration file name');
      console.log('Usage: node run-any-migration.js <migration-file-name>');
      console.log('Example: node run-any-migration.js 007_add_section_to_faculty.sql');
      process.exit(1);
    }
    
    console.log(`🔄 Running migration: ${migrationFile}`);
    
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'src', 'migrations', migrationFile);
    
    if (!fs.existsSync(sqlFile)) {
      console.error(`❌ Migration file not found: ${sqlFile}`);
      process.exit(1);
    }
    
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute the SQL
    await db.query(sql);
    
    console.log('✅ Migration completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

runMigration();
