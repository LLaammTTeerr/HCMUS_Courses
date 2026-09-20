import { expect, test } from '@playwright/test';
import { ADMIN, createInvite, nav, recordOf, register, signIn, signOut } from './helpers';

test.describe.configure({ mode: 'serial' });

test('the app is closed to strangers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Sign in to see your courses')).toBeVisible();
  expect(await page.evaluate(() => fetch('/api/record').then((r) => r.status))).toBe(401);
});

test('a wrong password is refused', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[autocomplete="username"]').fill(ADMIN.username);
  await page.locator('input[type="password"]').fill('definitely-wrong');
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page.getByText('Wrong username or password')).toBeVisible();
});

test('invite, register, and the two accounts stay separate', async ({ page }) => {
  await signIn(page, ADMIN.username, ADMIN.password);
  const code = await createInvite(page, 'e2e classmate');
  expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);

  await page.goto('/courses?quick=1');
  await page.locator('textarea').fill('CS160 1 8.5');
  await page.getByRole('button', { name: /^Save 1 attempt/ }).click();
  await expect(page.locator('textarea')).toBeHidden();
  await signOut(page);

  await register(page, 'classmate', 'classmate-password', code);
  await expect(page.locator('.sidebar')).toBeVisible();
  const theirs = await recordOf(page);
  expect(theirs.attempts).toHaveLength(0);
  expect(theirs.profile.currentSemester).toBe(1);
  await expect(nav(page, 'Invites')).toHaveCount(0);
  await signOut(page);

  // The same code cannot be used twice.
  await register(page, 'someone-else', 'another-password', code);
  await expect(page.locator('.errors')).toContainText('invite code');

  await page.getByRole('tab', { name: 'Sign in' }).click();
  await signIn(page, ADMIN.username, ADMIN.password);
  expect((await recordOf(page)).attempts).toHaveLength(1);
});

test('an admin reset forces the next sign-in to choose a password', async ({ page }) => {
  await signIn(page, ADMIN.username, ADMIN.password);
  await nav(page, 'Invites').click();
  await page.locator('tr', { hasText: 'classmate' }).getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByText('Temporary password')).toBeVisible();
  const temporary = (await page.locator('.banner strong.mono').last().innerText()).trim();
  await signOut(page);

  await page.locator('input[autocomplete="username"]').fill('classmate');
  await page.locator('input[type="password"]').fill(temporary);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page.getByText('Choose a new password')).toBeVisible();

  await page.locator('input[autocomplete="current-password"]').fill(temporary);
  await page.locator('input[autocomplete="new-password"]').fill('chosen-password-1');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await signOut(page);
  await signIn(page, 'classmate', 'chosen-password-1');
});
