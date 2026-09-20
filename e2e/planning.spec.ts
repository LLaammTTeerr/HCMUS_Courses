import { expect, test } from '@playwright/test';
import { ADMIN, nav, quickEntry, recordOf, resetRecord, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });

test('quick entry fills the dashboard', async ({ page }) => {
  await signIn(page, ADMIN.username, ADMIN.password);
  await resetRecord(page);
  await quickEntry(page, 'CS163 2 9\nMTH251 1 7\nPH211 1 6.5');
  await nav(page, 'Dashboard').click();
  await expect(page.getByText('Requirements by bucket')).toBeVisible();
  await expect(page.locator('.kpi', { hasText: 'Credits earned' })).toContainText('/ 163');
  await expect(page.locator('.kpi', { hasText: 'ĐTB tích lũy' })).toContainText('Khá');
});

test('a course can be dragged into a future semester and removed again', async ({ page }) => {
  await signIn(page, ADMIN.username, ADMIN.password);
  await resetRecord(page);
  await nav(page, 'Planner').click();
  const card = page.locator('.tray .pcard', { hasText: 'CS250' });
  await card.dragTo(page.locator('.column[aria-label="Semester 9"]'));
  const planned = page.locator('.column[aria-label="Semester 9"] .pcard', { hasText: 'CS250' });
  await expect(planned).toBeVisible();
  expect((await recordOf(page)).attempts.some((a: { code: string; semester: number }) => a.code === 'CS250' && a.semester === 9)).toBe(true);

  await planned.getByRole('button', { name: 'Remove CS250' }).click();
  await expect(planned).toHaveCount(0);
});

test('the suggested plan satisfies the requirements and can be undone', async ({ page }) => {
  await signIn(page, ADMIN.username, ADMIN.password);
  await resetRecord(page);
  await nav(page, 'Planner').click();
  await page.getByRole('radio', { name: 'Thesis (CS468)' }).click();

  // Undo is offered right after loading a plan (it belongs to that moment, not to the page).
  await page.getByRole('button', { name: 'Load suggested plan' }).click();
  await expect(page.getByRole('button', { name: /^Undo suggested plan/ })).toBeVisible();
  await page.getByRole('button', { name: /^Undo suggested plan/ }).click();
  await expect(page.getByRole('button', { name: /^Undo suggested plan/ })).toHaveCount(0);
  expect((await recordOf(page)).attempts).toHaveLength(0);

  // Loading it again completes the programme: the dashboard can name a graduation semester.
  await page.getByRole('button', { name: 'Load suggested plan' }).click();
  await expect(page.getByRole('button', { name: /^Undo suggested plan/ })).toBeVisible();
  await expect(page.locator('.card', { hasText: 'Plan check' })).toContainText('No problems found');
  await nav(page, 'Dashboard').click();
  await expect(page.locator('.kpi', { hasText: 'Earliest graduation' })).not.toContainText('Plan incomplete');
});

test('switching to the CLC program keeps the data and asks for a specialization', async ({ page }) => {
  await signIn(page, ADMIN.username, ADMIN.password);
  await resetRecord(page);
  await quickEntry(page, 'CS160 1 8');
  const before = (await recordOf(page)).attempts.length;
  await page.getByLabel('Program').selectOption('clc-2026');
  await page.getByRole('button', { name: 'Switch anyway' }).click();
  await expect(page.locator('.brand')).toContainText('CLC 2026');
  expect((await recordOf(page)).attempts).toHaveLength(before);   // nothing was deleted

  await nav(page, 'Planner').click();
  await expect(page.getByText('Specialization (chuyên ngành)')).toBeVisible();
  await page.getByRole('radio', { name: 'Khoa học dữ liệu' }).click();
  await nav(page, 'Dashboard').click();
  await expect(page.locator('.bar-row', { hasText: 'Specialization — compulsory' })).toBeVisible();

  await page.getByLabel('Program').selectOption('apcs-2024');
  await expect(page.locator('.brand')).toContainText('APCS 2024');
});
