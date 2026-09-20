import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 5188);
const DB = process.env.E2E_DB ?? '.e2e/progress.db';

/**
 * End-to-end tests run against a production build on a throwaway database, so they never touch
 * data/progress.db. The admin password is fixed here so the tests can sign in.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list']],
  timeout: 45_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: `npm run build && npx tsx server/index.ts`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      PROGRESS_DB: DB,
      ADMIN_USER: 'admin',
      ADMIN_PASSWORD: 'e2e-admin-password',
      ADMIN_NAME: 'Admin',
    },
  },
});
