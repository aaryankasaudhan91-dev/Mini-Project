import {readFile} from 'node:fs/promises';
import {pool} from './db.js';
import {hashPassword} from './auth.js';
const client=await pool.connect();
try {
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(21001)');
 await client.query(await readFile(new URL('./database/schema.sql',import.meta.url),'utf8'));
 await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
 const name='001_operations';
 if(!(await client.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])).rowCount) {
  await client.query(await readFile(new URL('./database/migrations/001_operations.sql',import.meta.url),'utf8'));
  await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
 }
 for(const u of (await client.query('SELECT id,password FROM users')).rows)
  if(!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(u.password)) await client.query('UPDATE users SET password=$1 WHERE id=$2',[await hashPassword(u.password),u.id]);
 await client.query('COMMIT'); console.log('Migration complete; existing accounts and data preserved.');
} catch(e) { await client.query('ROLLBACK'); throw e; }
finally {client.release();await pool.end();}

