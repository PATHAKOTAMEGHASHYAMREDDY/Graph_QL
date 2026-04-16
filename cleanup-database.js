/**
 * Clean up all data from database
 * WARNING: This will delete ALL data from all tables!
 * Usage: node cleanup-database.js
 */

const db = require('./src/db');

async function cleanupDatabase() {
  try {
    console.log('⚠️  WARNING: This will delete ALL data from the database!');
    console.log('🔄 Starting database cleanup...\n');

    // Delete data from all tables (in correct order to respect foreign keys)
    
    // 1. Delete refresh tokens (depends on faculty and users)
    console.log('🗑️  Deleting refresh tokens...');
    const refreshTokensResult = await db.query('DELETE FROM refresh_tokens');
    console.log(`   ✅ Deleted ${refreshTokensResult.rowCount} faculty refresh tokens`);
    
    const studentRefreshTokensResult = await db.query('DELETE FROM student_refresh_tokens');
    console.log(`   ✅ Deleted ${studentRefreshTokensResult.rowCount} student refresh tokens`);

    // 2. Delete documents (depends on faculty)
    console.log('🗑️  Deleting documents...');
    const documentsResult = await db.query('DELETE FROM documents');
    console.log(`   ✅ Deleted ${documentsResult.rowCount} documents`);

    // 3. Delete students/users (depends on faculty)
    console.log('🗑️  Deleting students...');
    const usersResult = await db.query('DELETE FROM users');
    console.log(`   ✅ Deleted ${usersResult.rowCount} students`);

    // 4. Delete faculty
    console.log('🗑️  Deleting faculty...');
    const facultyResult = await db.query('DELETE FROM faculty');
    console.log(`   ✅ Deleted ${facultyResult.rowCount} faculty members`);

    // 5. Delete OTP records
    console.log('🗑️  Deleting OTP records...');
    const otpResult = await db.query('DELETE FROM otp_store');
    console.log(`   ✅ Deleted ${otpResult.rowCount} OTP records`);

    // 6. Reset sequences (auto-increment IDs)
    console.log('\n🔄 Resetting ID sequences...');
    await db.query('ALTER SEQUENCE faculty_id_seq RESTART WITH 1');
    console.log('   ✅ Reset faculty ID sequence');
    
    await db.query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
    console.log('   ✅ Reset users ID sequence');
    
    await db.query('ALTER SEQUENCE documents_id_seq RESTART WITH 1');
    console.log('   ✅ Reset documents ID sequence');
    
    await db.query('ALTER SEQUENCE refresh_tokens_id_seq RESTART WITH 1');
    console.log('   ✅ Reset refresh_tokens ID sequence');
    
    await db.query('ALTER SEQUENCE student_refresh_tokens_id_seq RESTART WITH 1');
    console.log('   ✅ Reset student_refresh_tokens ID sequence');

    // Verify cleanup
    console.log('\n📊 Verifying cleanup...');
    const facultyCount = await db.query('SELECT COUNT(*) FROM faculty');
    const usersCount = await db.query('SELECT COUNT(*) FROM users');
    const documentsCount = await db.query('SELECT COUNT(*) FROM documents');
    const refreshTokensCount = await db.query('SELECT COUNT(*) FROM refresh_tokens');
    const studentRefreshTokensCount = await db.query('SELECT COUNT(*) FROM student_refresh_tokens');
    const otpCount = await db.query('SELECT COUNT(*) FROM otp_store');

    console.log(`   Faculty: ${facultyCount.rows[0].count}`);
    console.log(`   Students: ${usersCount.rows[0].count}`);
    console.log(`   Documents: ${documentsCount.rows[0].count}`);
    console.log(`   Faculty Refresh Tokens: ${refreshTokensCount.rows[0].count}`);
    console.log(`   Student Refresh Tokens: ${studentRefreshTokensCount.rows[0].count}`);
    console.log(`   OTP Records: ${otpCount.rows[0].count}`);

    console.log('\n✅ Database cleanup completed successfully!');
    console.log('📝 All data has been deleted and ID sequences reset.');
    console.log('🎯 You can now create fresh data.');
    console.log('\n💡 Note: RBAC tables (roles, permissions, role_permissions) were NOT deleted.');
    console.log('   These are system configuration and should remain.');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

cleanupDatabase();
