import { expect, type Page } from '@playwright/test';

export const ADMIN = { username: 'admin', password: 'e2e-admin-password' };

export async function signIn(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Sign in' }).click().catch(() => undefined);
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page.locator('.sidebar')).toBeVisible();
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText('Sign in to see your courses')).toBeVisible();
}

/** Sidebar navigation — page bodies also link to the same routes. */
export const nav = (page: Page, name: string) => page.locator('nav').getByRole('link', { name });

/** Creates an invite as the signed-in admin and returns the code. */
export async function createInvite(page: Page, note: string): Promise<string> {
  await nav(page, 'Invites').click();
  await page.getByPlaceholder('e.g. Mai — CLC 2026').fill(note);
  await page.getByRole('button', { name: 'Create code' }).click();
  await expect(page.getByText('Share this code')).toBeVisible();
  return (await page.locator('.banner strong.mono').first().innerText()).trim();
}

export async function register(page: Page, username: string, password: string, code: string) {
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.getByPlaceholder('XXXX-XXXX-XXXX-XXXX').fill(code);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

/** Adds attempts through the quick-entry box. */
export async function quickEntry(page: Page, lines: string) {
  await page.goto('/courses?quick=1');
  await page.locator('textarea').fill(lines);
  await page.getByRole('button', { name: /^Save \d+ attempt/ }).click();
  await expect(page.locator('textarea')).toBeHidden();
}

export const recordOf = (page: Page) =>
  page.evaluate(() => fetch('/api/record').then((r) => r.json()));

/** Empties the signed-in user's record so a test starts from a known state. */
export async function resetRecord(page: Page) {
  await page.evaluate(async () => {
    const record = await fetch('/api/record').then((r) => r.json());
    const ids = record.attempts.map((a: { id: number }) => a.id);
    if (ids.length) {
      await fetch('/api/attempts/batch-delete', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }),
      });
    }
    await fetch('/api/profile', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ programId: 'apcs-2024', choices: {}, currentSemester: 7 }),
    });
  });
  await page.reload();
}
