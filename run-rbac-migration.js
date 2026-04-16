/**
 * Run database migration for RBAC (Role-Based Access Control)
 * Usage: node run-rbac-migration.js
 */

const fs = require('fs');
const path = require('path');
const db = require('./src/db');

async function runMigration() {
  try {
    console.log('🔄 Running migration: 005_add_rbac_system.sql');
    
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'src', 'migrations', '005_add_rbac_system.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute the SQL
    await db.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('📋 Created tables: roles, permissions, role_permissions');
    console.log('📋 Added role_id columns to faculty and users tables');
    console.log('📋 Created indexes for performance');
    
    // Verify roles were created
    const rolesResult = await db.query('SELECT * FROM roles ORDER BY id');
    console.log('\n📊 Roles created:');
    rolesResult.rows.forEach(role => {
      console.log(`  - ${role.name}: ${role.description}`);
    });
    
    // Count permissions
    const permResult = await db.query('SELECT COUNT(*) FROM permissions');
    console.log(`\n📊 Total permissions: ${permResult.rows[0].count}`);
    
    // Show role-permission mappings
    const mappingResult = await db.query(`
      SELECT r.name as role, COUNT(rp.permission_id) as permission_count
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      GROUP BY r.id, r.name
      ORDER BY r.id
    `);
    
    console.log('\n📊 Role-Permission Mappings:');
    mappingResult.rows.forEach(row => {
      console.log(`  - ${row.role}: ${row.permission_count} permissions`);
    });
    
    console.log('\n🎉 RBAC system is now ready!');
    console.log('Roles: admin, faculty, student');
    console.log('All existing faculty members have been assigned the "faculty" role');
    console.log('All existing students have been assigned the "student" role');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

runMigration();
