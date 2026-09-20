import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from './app';
import { newTemporaryPassword } from './auth';
import { backupDb, openDb } from './db';
import { createUsers } from './users';

const root = resolve(import.meta.dirname, '..');
const dbFile = process.env.PROGRESS_DB ?? resolve(root, 'data/progress.db');
const port = Number(process.env.PORT ?? 5174);
// 0.0.0.0 so `npm start` is reachable over Tailscale; set HOST=127.0.0.1 to keep it local.
const hostname = process.env.HOST ?? '0.0.0.0';

const backup = backupDb(dbFile, resolve(dirname(dbFile), 'backups'));
const db = openDb(dbFile);

// First run (or a database from before accounts existed): create the admin who owns the existing data.
const users = createUsers(db);
if (users.count() === 0) {
  const username = (process.env.ADMIN_USER ?? 'admin').toLowerCase();
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? newTemporaryPassword();
  await users.create({ id: 1, username, displayName: process.env.ADMIN_NAME ?? username, password, isAdmin: true, mustChangePassword: generated });
  console.log(generated
    ? `Created admin "${username}" with password: ${password}  (change it after signing in)`
    : `Created admin "${username}" with the password from ADMIN_PASSWORD`);
}

const server = new Hono();
server.route('/', createApp(db));

const dist = resolve(root, 'dist');
if (process.env.NODE_ENV === 'production' && existsSync(dist)) {
  server.use('/*', serveStatic({ root: dist }));
  server.get('*', serveStatic({ path: resolve(dist, 'index.html') }));
}

serve({ fetch: server.fetch, port, hostname }, (info) => {
  console.log(`API on http://${hostname}:${info.port}/api · database ${dbFile}${backup ? ` · backup ${backup}` : ''}`);
});

const close = () => {
  db.close();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
