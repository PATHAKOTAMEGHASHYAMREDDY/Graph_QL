require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.replace('sslmode=require', 'sslmode=verify-full'),
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      DO $migr$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='faculty' AND column_name='class_section'
        ) THEN
          ALTER TABLE faculty ADD COLUMN class_section VARCHAR(50);
        END IF;
      END $migr$
    `);
    console.log('✅ faculty.class_section column OK');
    console.log('🎉 Migration complete!');
  } catch (e) {
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
