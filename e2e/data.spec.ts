import { expect, test } from '@playwright/test';
import { ADMIN, nav, quickEntry, recordOf, resetRecord, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });

test('a backup can be downloaded and restored', async ({ page }) => {
  await signIn(page, ADMIN.username, ADMIN.password);
  await resetRecord(page);
  await quickEntry(page, 'CS160 1 8.5\nMTH251 1 7');

  // Download the snapshot the page offers.
  const snapshot = await page.evaluate(() => fetch('/api/export').then((r) => r.json()));
  expect(snapshot.format).toBe('hcmus-progress-export');
  expect(snapshot.attempts).toHaveLength(2);

  // Wreck the record, then restore the file through the page.
  await resetRecord(page);
  expect((await recordOf(page)).attempts).toHaveLength(0);

  await nav(page, 'Your data').click();
  await expect(page.getByRole('heading', { name: 'Download' })).toBeVisible();
  await page.getByLabel('Backup file').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(snapshot)),
  });
  await page.getByRole('button', { name: 'Replace' }).click();
  await expect(page.locator('.banner').filter({ hasText: 'Restored.' })).toBeVisible();
  expect((await recordOf(page)).attempts).toHaveLength(2);
});

test('the CSV export lists the courses', async ({ page }) => {
  await signIn(page, ADMIN.username, ADMIN.password);
  const csv = await page.evaluate(() => fetch('/api/export.csv').then((r) => r.text()));
  expect(csv.split('\n')[0]).toBe('code,name,credits,semester,status,grade10');
  expect(csv).toContain('CS160');
});

test('a file from another program is refused', async ({ page }) => {
  await signIn(page, ADMIN.username, ADMIN.password);
  await nav(page, 'Your data').click();
  const snapshot = await page.evaluate(() => fetch('/api/export').then((r) => r.json()));
  const foreign = { ...snapshot, attempts: [{ code: 'CSC10012', semester: 1, status: 'completed', grade10: 8 }] };
  await page.getByLabel('Backup file').setInputFiles({
    name: 'foreign.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(foreign)),
  });
  await page.getByRole('button', { name: 'Replace' }).click();
  await expect(page.locator('.banner.error')).toContainText('CSC10012');
});
