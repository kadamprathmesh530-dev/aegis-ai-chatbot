/**
 * Migration: Add Google Authentication Support
 * 
 * This migration adds support for Google OAuth authentication to the users table.
 * It can be run safely on existing databases without data loss.
 * 
 * Changes:
 * 1. Makes password_hash nullable (for Google-only users)
 * 2. Adds google_id column (TEXT UNIQUE, nullable)
 * 3. Adds avatar_url column (TEXT, nullable)
 * 4. Adds auth_provider column (TEXT NOT NULL DEFAULT 'email')
 * 5. Adds index on google_id for fast lookups
 * 
 * Run with: node server/db/migrate-google-auth.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Error: DATABASE_URL is not configured.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('[MIGRATION] Starting Google Auth migration...');

    // 1. Make password_hash nullable for Google-only users
    console.log('[MIGRATION] Making password_hash nullable...');
    await client.query(`
      ALTER TABLE users 
      ALTER COLUMN password_hash DROP NOT NULL;
    `);

    // 2. Add google_id column (unique, nullable)
    console.log('[MIGRATION] Adding google_id column...');
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
    `);

    // 3. Add avatar_url column (nullable)
    console.log('[MIGRATION] Adding avatar_url column...');
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    `);

    // 4. Add auth_provider column with default 'email'
    console.log('[MIGRATION] Adding auth_provider column...');
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email'
        CHECK (auth_provider IN ('email', 'google'));
    `);

    // 5. Add index on google_id for fast lookups
    console.log('[MIGRATION] Adding index on google_id...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_google_id
      ON users(google_id);
    `);

    await client.query('COMMIT');
    console.log('[MIGRATION] Google Auth migration completed successfully!');

    // Verify the migration
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n[MIGRATION] Updated users table schema:');
    console.table(result.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[MIGRATION] Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('[MIGRATION] Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[MIGRATION] Fatal error:', err);
    process.exit(1);
  });