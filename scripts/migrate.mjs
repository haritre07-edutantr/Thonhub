import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before deploying. See README.md.');
if (url.startsWith('file:')) await mkdir(path.dirname(path.resolve(root, url.slice(5))), { recursive: true });
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: 'number' });
try {
  await client.execute('CREATE TABLE IF NOT EXISTS _thonhub_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const directory = path.join(root, 'drizzle');
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await readFile(path.join(directory, name), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const prior = await client.execute({ sql: 'SELECT checksum FROM _thonhub_migrations WHERE name=?', args: [name] });
    if (prior.rows.length) { if (prior.rows[0].checksum !== checksum) throw new Error('An applied migration was changed: ' + name); continue; }
    const statements = sql.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean);
    await client.batch([...statements.map(sql => ({ sql, args: [] })), { sql: 'INSERT INTO _thonhub_migrations(name,checksum,applied_at) VALUES(?,?,?)', args: [name, checksum, new Date().toISOString()] }], 'write');
    console.log('Applied ' + name);
  }
  console.log('Database schema is ready.');
} finally { client.close(); }
