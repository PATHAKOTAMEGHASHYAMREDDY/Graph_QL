/**
 * Run database migration for student authentication
 * Usage: node run-student-auth-migration.js
 */

const fs = require('fs');
const path = require('path');
const db = require('./src/db');

async function runMigration() {
  try {
    console.log('🔄 Running migration: 004_add_student_authentication.sql');
    
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'src', 'migrations', '004_add_student_authentication.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute the SQL
    await db.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('📋 Added password_hash column to users table');
    console.log('📋 Created table: student_refresh_tokens');
    console.log('📋 Created indexes for fast lookups');
    console.log('📋 Added unique constraint on users.email');
    
    // Verify the student_refresh_tokens table was created
    const result = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'student_refresh_tokens'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📊 student_refresh_tokens table structure:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    // Verify password_hash column was added to users
    const usersResult = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'password_hash'
    `);
    
    if (usersResult.rows.length > 0) {
      console.log('\n✅ password_hash column added to users table');
    }
    
    console.log('\n🎉 Student authentication is now ready!');
    console.log('Students can now register and login at:');
    console.log('  - Signup: http://localhost:4200/student/signup');
    console.log('  - Login:  http://localhost:4200/student/login');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

runMigration();
