require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.replace('sslmode=require', 'sslmode=verify-full'),
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
