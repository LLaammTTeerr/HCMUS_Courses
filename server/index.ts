import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';
import { backupDb, openDb } from './db';

const root = resolve(import.meta.dirname, '..');
const dbFile = process.env.PROGRESS_DB ?? resolve(root, 'data/progress.db');
const port = Number(process.env.PORT ?? 5174);

const backup = backupDb(dbFile, resolve(root, 'data/backups'));
const db = openDb(dbFile);

const server = new Hono();
server.route('/', createApp(db));

const dist = resolve(root, 'dist');
if (process.env.NODE_ENV === 'production' && existsSync(dist)) {
  server.use('/*', serveStatic({ root: dist }));
  server.get('*', serveStatic({ path: resolve(dist, 'index.html') }));
}

serve({ fetch: server.fetch, port }, (info) => {
  console.log(`API on http://localhost:${info.port}/api · database ${dbFile}${backup ? ` · backup ${backup}` : ''}`);
});

const close = () => {
  db.close();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
