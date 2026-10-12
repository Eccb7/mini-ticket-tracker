const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/tickets';
const DEFAULT_TEST_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/tickets_test';

function createPool(connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL) {
  return new Pool({ connectionString });
}

// schema.sql is idempotent, so running it on every boot is safe.
async function applySchema(pool) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

module.exports = { createPool, applySchema, DEFAULT_DATABASE_URL, DEFAULT_TEST_DATABASE_URL };
