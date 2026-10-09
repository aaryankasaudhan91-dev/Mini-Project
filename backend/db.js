// backend/db.js
import pkg from 'pg';
const { Pool } = pkg;
import './config.js';

export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'hms_db',
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database:', process.env.PGDATABASE || 'hms_db');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});
