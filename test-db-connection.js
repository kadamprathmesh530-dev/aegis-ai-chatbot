require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { Pool } = require('pg');
const fs = require('fs');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Extract hostname for logging (no credentials)
const url = new URL(databaseUrl);
console.log('Testing connection to:', url.hostname);

// Test with explicit SSL configuration (not from connection string)
const pool = new Pool({
  connectionString: databaseUrl.replace('sslmode=require', '').replace('sslmode=verify-full', '').replace('channel_binding=require', '').replace('&&', '&').replace('?&', '?').replace(/\?$/, ''),
  ssl: {
    rejectUnauthorized: false,
    // Explicitly request server certificate
    requestCert: true,
    // Neon requires SNI
    servername: url.hostname
  }
});

pool.connect()
  .then(client => {
    console.log('Connected successfully!');
    return client.query('SELECT version()');
  })
  .then(result => {
    console.log('PostgreSQL version:', result.rows[0].version);
    return pool.end();
  })
  .catch(err => {
    console.error('Connection error:', err.message, err.code || '');
    return pool.end();
  });