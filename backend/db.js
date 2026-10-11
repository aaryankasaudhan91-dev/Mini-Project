// backend/db.js
import pkg from 'pg';
const { Pool } = pkg;
import './config.js';

export const pool = new Pool({
  ...(process.env.DATABASE_URL ? {connectionString:process.env.DATABASE_URL} : {
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  }),
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
