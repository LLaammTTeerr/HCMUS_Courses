import { rmSync } from 'node:fs';
import { dirname } from 'node:path';

/** Every run starts from an empty database so tests never inherit yesterday's state. */
export default function globalSetup() {
  const file = process.env.E2E_DB ?? '.e2e/progress.db';
  rmSync(dirname(file), { recursive: true, force: true });
}
