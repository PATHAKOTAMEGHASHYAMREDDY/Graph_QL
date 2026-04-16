/**
 * Show database status - all tables and their row counts
 * Usage: node show-database-status.js
 */

const db = require('./src/db');

async function showDatabaseStatus() {
  try {
    console.log('📊 Database Status Report\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Get all tables
    const tablesResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`📋 Total Tables: ${tablesResult.rows.length}\n`);

    // For each table, show row count and sample data
    for (const table of tablesResult.rows) {
      const tableName = table.table_name;
      
      // Get row count
      const countResult = await db.query(`SELECT COUNT(*) FROM ${tableName}`);
      const count = parseInt(countResult.rows[0].count);
      
      console.log(`📦 ${tableName.toUpperCase()}`);
      console.log(`   Rows: ${count}`);
      
      if (count > 0) {
        // Show column names
        const columnsResult = await db.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = '${tableName}'
          ORDER BY ordinal_position
          LIMIT 5
        `);
        
        console.log(`   Columns: ${columnsResult.rows.map(c => c.column_name).join(', ')}`);
        
        // Show sample data (first 3 rows)
        const sampleResult = await db.query(`SELECT * FROM ${tableName} LIMIT 3`);
        if (sampleResult.rows.length > 0) {
          console.log(`   Sample data (first ${sampleResult.rows.length} rows):`);
          sampleResult.rows.forEach((row, idx) => {
            console.log(`     ${idx + 1}. ID: ${row.id || 'N/A'}, ${Object.keys(row).slice(1, 3).map(k => `${k}: ${row[k]}`).join(', ')}`);
          });
        }
      } else {
        console.log(`   ✓ Empty (ready for fresh data)`);
      }
      
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════\n');

    // Summary
    const facultyCount = await db.query('SELECT COUNT(*) FROM faculty');
    const usersCount = await db.query('SELECT COUNT(*) FROM users');
    const documentsCount = await db.query('SELECT COUNT(*) FROM documents');
    const refreshTokensCount = await db.query('SELECT COUNT(*) FROM refresh_tokens');
    const studentRefreshTokensCount = await db.query('SELECT COUNT(*) FROM student_refresh_tokens');
    const rolesCount = await db.query('SELECT COUNT(*) FROM roles');
    const permissionsCount = await db.query('SELECT COUNT(*) FROM permissions');

    console.log('📈 Summary:');
    console.log(`   Faculty Members: ${facultyCount.rows[0].count}`);
    console.log(`   Students: ${usersCount.rows[0].count}`);
    console.log(`   Documents: ${documentsCount.rows[0].count}`);
    console.log(`   Faculty Sessions: ${refreshTokensCount.rows[0].count}`);
    console.log(`   Student Sessions: ${studentRefreshTokensCount.rows[0].count}`);
    console.log(`   Roles: ${rolesCount.rows[0].count}`);
    console.log(`   Permissions: ${permissionsCount.rows[0].count}`);

    console.log('\n✅ Database status check completed!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Status check failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

showDatabaseStatus();
