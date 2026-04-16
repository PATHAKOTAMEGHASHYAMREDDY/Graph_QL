/**
 * Run database migration for refresh_tokens table
 * Usage: node run-migration.js
 */

const fs = require('fs');
const path = require('path');
const db = require('./src/db');

async function runMigration() {
  try {
    console.log('🔄 Running migration: 003_create_refresh_tokens_table.sql');
    
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'src', 'migrations', '003_create_refresh_tokens_table.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute the SQL
    await db.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('📋 Created table: refresh_tokens');
    console.log('📋 Created indexes for fast lookups');
    
    // Verify the table was created
    const result = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'refresh_tokens'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📊 Table structure:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

runMigration();
