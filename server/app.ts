import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  attemptInput, attemptPatch, batchDeleteInput, batchInput, englishInput, gpaOverrideInput, profilePatch, type AttemptInput,
} from '../shared/api';
import { courseIndex, getProgram, PROGRAM_IDS } from '../shared/programs/index';
import type { Db } from './db';
import { createRepo } from './repo';

class BadRequest extends Error {}

async function parseBody<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new BadRequest('Body must be JSON');
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new BadRequest(`${issue.path.join('.') || 'body'}: ${issue.message}`);
  }
  return result.data;
}

export function createApp(db: Db) {
  const repo = createRepo(db);
  const app = new Hono().basePath('/api');

  const checkCodes = (attempts: Pick<AttemptInput, 'code'>[]) => {
    const program = getProgram(repo.getProfile().programId);
    const index = courseIndex(program);
    for (const a of attempts) {
      if (!index.has(a.code)) throw new BadRequest(`Unknown course code ${a.code} for ${program.id}`);
    }
  };
  const idParam = (c: Context) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) throw new BadRequest('Invalid id');
    return id;
  };

  app.onError((err, c) => {
    if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
    console.error(err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));
  app.get('/record', (c) => c.json(repo.getRecord()));

  app.put('/profile', async (c) => {
    const patch = await parseBody(c, profilePatch);
    if (patch.programId !== undefined && !PROGRAM_IDS.includes(patch.programId)) {
      throw new BadRequest(`Unknown program ${patch.programId}`);
    }
    return c.json(repo.updateProfile(patch));
  });

  app.post('/attempts', async (c) => {
    const input = await parseBody(c, attemptInput);
    checkCodes([input]);
    return c.json(repo.insertAttempts([input])[0], 201);
  });

  app.post('/attempts/batch', async (c) => {
    const { attempts } = await parseBody(c, batchInput);
    checkCodes(attempts);
    return c.json(repo.insertAttempts(attempts), 201);
  });

  app.patch('/attempts/:id', async (c) => {
    const id = idParam(c);
    const patch = await parseBody(c, attemptPatch);
    const current = repo.getAttempt(id);
    if (!current) return c.json({ error: 'Attempt not found' }, 404);
    const next = { ...current, ...patch };
    if (next.status === 'completed' && next.grade10 === null) throw new BadRequest('grade10: A completed attempt needs a grade');
    return c.json(repo.updateAttempt(id, patch));
  });

  app.delete('/attempts/:id', (c) => {
    const removed = repo.deleteAttempts([idParam(c)]);
    return removed ? c.body(null, 204) : c.json({ error: 'Attempt not found' }, 404);
  });

  app.post('/attempts/batch-delete', async (c) => {
    const { ids } = await parseBody(c, batchDeleteInput);
    repo.deleteAttempts(ids);
    return c.body(null, 204);
  });

  app.put('/english', async (c) => c.json(repo.putEnglish(await parseBody(c, englishInput))));
  app.delete('/english', (c) => {
    repo.deleteEnglish();
    return c.body(null, 204);
  });

  app.put('/gpa-overrides/:code', async (c) => {
    const code = c.req.param('code').toUpperCase();
    checkCodes([{ code }]);
    const { counts } = await parseBody(c, gpaOverrideInput);
    repo.setGpaOverride(code, counts);
    return c.json(repo.getGpaOverrides());
  });

  app.delete('/gpa-overrides/:code', (c) => {
    repo.deleteGpaOverride(c.req.param('code').toUpperCase());
    return c.json(repo.getGpaOverrides());
  });

  // Registered last so unknown /api paths get JSON instead of the UI fallback.
  app.all('/*', (c) => c.json({ error: 'Not found' }, 404));

  return app;
}
