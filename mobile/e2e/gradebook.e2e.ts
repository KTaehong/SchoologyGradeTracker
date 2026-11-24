/**
 * Typing a class in by hand, the way a new student would: class → category →
 * assignment → forecast, with the slips a person makes along the way. The
 * class is deleted at the end, so the test account is left as it was.
 */
import type { Page } from '@playwright/test';

import { answerDialogs, button, expect, field, hasAccount, openTab, signIn, test, text, waitForSync } from './support/app';

const CLASS_NAME = 'E2E Robotics';

async function deleteTestClasses(page: Page) {
  await openTab(page, 'Grades');
  for (;;) {
    const card = page.getByRole('button', { name: new RegExp(`^${CLASS_NAME}`) }).filter({ visible: true });
    if ((await card.count()) === 0) return;
    await card.last().click();
    await button(page, 'Edit').click();
    await button(page, 'Delete class').click();
    await expect(page.getByRole('heading', { name: 'Grades' }).filter({ visible: true })).toBeVisible();
  }
}

test.describe('typing in a class by hand', () => {
  test.skip(!hasAccount, 'set E2E_EMAIL and E2E_PASSWORD in mobile/.env.local');

  test('add a class, a category, an assignment and a forecast, then delete it', async ({ page }) => {
    answerDialogs(page, 'accept');
    await signIn(page);
    await deleteTestClasses(page);

    // A class: an empty name is refused; a double tap adds it once.
    await button(page, '+ Add').click();
    await button(page, /^Add a class/).click();
    await button(page, 'Add class').click();
    await expect(text(page, /Give the class a name/)).toBeVisible();
    await field(page, 'Class name').fill(CLASS_NAME);
    await field(page, 'Teacher (optional)').fill('Mx. <b>Test</b> 😀');
    await button(page, 'Add class').dblclick();
    await expect(text(page, 'No categories yet')).toBeVisible();

    // A category: junk is explained, then a good one is saved.
    await button(page, '+ Add category').click();
    await field(page, 'Category name').fill('Tests');
    await field(page, /^Weight/).fill('forty');
    await button(page, 'Add category').click();
    await expect(text(page, /Write the weight as a percent/)).toBeVisible();
    await field(page, /^Weight/).fill('40%');
    await field(page, /^Drop the lowest/).fill('1.5');
    await button(page, 'Add category').click();
    await expect(text(page, /Drop lowest must be a whole number/)).toBeVisible();
    await field(page, /^Drop the lowest/).fill('');
    await button(page, 'Add category').click();
    await expect(text(page, 'Tests · 40%')).toBeVisible();

    // An assignment: junk, an impossible date and a mistyped score are explained.
    await button(page, /^\+ Add assignment/).click();
    const addAssignment = button(page, 'Add assignment');
    await field(page, 'Assignment name').fill('Unit 1 Test');
    await field(page, /^Points you got/).fill('-5');
    await field(page, 'Points possible').fill('100');
    await addAssignment.click();
    await expect(text(page, /Enter the points you got/)).toBeVisible();
    await field(page, /^Points you got/).fill('9000');
    await addAssignment.click();
    await expect(text(page, /far more than the 100 points possible/)).toBeVisible();
    await field(page, /^Points you got/).fill('90');
    await field(page, /^Due date/).fill('2/31');
    await addAssignment.click();
    await expect(text(page, /Write the due date like/)).toBeVisible();
    await field(page, /^Due date/).fill('12/1');
    await addAssignment.dblclick();
    await expect(text(page, '90 / 100')).toBeVisible();
    await expect(text(page, '90.00% · A-').first()).toBeVisible();
    await expect(page.getByText('Unit 1 Test').filter({ visible: true })).toHaveCount(1);

    // A forecast for work that is not graded yet changes the projected grade.
    await button(page, /^\+ Forecast new work/).click();
    await button(page, 'Save forecast').click();
    // The only category is already picked; the missing name is explained.
    await expect(text(page, /Give the work a name/)).toBeVisible();
    await field(page, 'Name').fill('Unit 2 Test');
    await field(page, 'Points possible').fill('100');
    await field(page, 'Points you expect').fill('100');
    await button(page, 'Save forecast').click();
    await expect(text(page, /^Projected with forecasts:/)).toBeVisible();
    await expect(text(page, '95.00% · A').first()).toBeVisible();

    // "What do I need?" answers for the ungraded test, and explains a bad target.
    await button(page, /^What do I need/).click();
    await expect(text(page, 'You need 90 out of 100 (90%) on Unit 2 Test to reach 90%.')).toBeVisible();
    await field(page, /^Target grade/).fill('99');
    await expect(text(page, /Even full points on Unit 2 Test do not reach 99%/)).toBeVisible();
    await field(page, /^Target grade/).fill('an A');
    await expect(text(page, /Enter the grade you want in percent/)).toBeVisible();
    await page.goBack();

    // The class is on the Grades tab and on Home.
    await page.goBack();
    await expect(page.getByRole('button', { name: new RegExp(`^${CLASS_NAME}`) }).filter({ visible: true })).toHaveCount(1);
    await waitForSync(page);

    await deleteTestClasses(page);
    await expect(page.getByRole('button', { name: new RegExp(`^${CLASS_NAME}`) }).filter({ visible: true })).toHaveCount(0);
    await waitForSync(page);
  });

  test('sample grades cannot be added twice', async ({ page }) => {
    // The test account already has the sample classes.
    const dialogs = answerDialogs(page, 'accept');
    await signIn(page);
    test.skip((await text(page, 'AP Calculus BC').count()) === 0, 'this account does not hold the sample classes');
    await openTab(page, 'Settings');
    await button(page, /^Add sample grades/).click();
    await expect.poll(() => dialogs.join(' ')).toContain('already in your gradebook');
  });

  test('a change made offline is sent by itself once the connection is back', async ({ page, context }) => {
    await signIn(page);
    await openTab(page, 'Settings');
    await context.setOffline(true);
    await button(page, /^Sync now/).click();
    await expect(text(page, /^Offline/)).toBeVisible();
    await context.setOffline(false);
    // No tap needed: the app retries on its own.
    await expect(text(page, /^Synced /)).toBeVisible({ timeout: 45_000 });
  });
});
