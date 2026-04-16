/**
 * Run database migration for section column
 * Usage: node run-section-migration.js
 */

const fs = require('fs');
const path = require('path');
const db = require('./src/db');

async function runMigration() {
  try {
    console.log('🔄 Running migration: 006_add_section_to_users.sql');
    
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'src', 'migrations', '006_add_section_to_users.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute the SQL
    await db.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('📋 Added section column to users table');
    console.log('📋 Created indexes for section-based queries');
    
    console.log('\n🎯 Section system is now ready!');
    console.log('Available sections: S01, S02, S03, S04, S05, S06, S07, S08');
    console.log('Faculty and students will be linked by their section.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

runMigration();
