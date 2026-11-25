/**
 * Shared helpers for the user-style tests. Everything finds controls the way a
 * person (or a screen reader) does: by role and visible label, never by CSS.
 */
import { expect, test as base, type Locator, type Page } from '@playwright/test';

export const ACCOUNT = {
  email: process.env.E2E_EMAIL ?? '',
  password: process.env.E2E_PASSWORD ?? '',
};
export const hasAccount = ACCOUNT.email !== '' && ACCOUNT.password !== '';

/** Console errors that are about the network, not about the app's code. */
const NETWORK_NOISE = /Failed to load resource|net::ERR_|AuthRetryableFetchError|Failed to fetch/i;

type Fixtures = {
  /** Errors the app threw or logged during the test. The test fails if any are left. */
  appErrors: string[];
};

/**
 * `test` with a safety net: any uncaught error or console.error in the app
 * fails the test, even when every step passed. Browser dialogs are answered
 * by each test with `answerDialogs`.
 */
export const test = base.extend<Fixtures>({
  appErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`Uncaught: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error' && !NETWORK_NOISE.test(message.text())) {
          errors.push(`console.error: ${message.text().slice(0, 500)}`);
        }
      });
      await use(errors);
      expect(errors, 'the app logged errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Accepts or dismisses every confirm/alert, and records what they said. */
export function answerDialogs(page: Page, answer: 'accept' | 'dismiss'): string[] {
  const seen: string[] = [];
  page.on('dialog', async (dialog) => {
    seen.push(dialog.message());
    await (answer === 'accept' ? dialog.accept() : dialog.dismiss()).catch(() => undefined);
  });
  return seen;
}

/**
 * What the student can see and reach. A tab or screen that is covered stays in
 * the page as `inert`: it has a size, but nobody can tap it or hear it read.
 */
export function inFront(locator: Locator): Locator {
  return locator.and(locator.page().locator(':not([inert], [inert] *)')).filter({ visible: true });
}

/** A button on the screen in front (earlier screens stay mounted underneath). */
export function button(page: Page, name: string | RegExp): Locator {
  return inFront(page.getByRole('button', { name, exact: typeof name === 'string' })).last();
}

export function field(page: Page, label: string | RegExp): Locator {
  return inFront(page.getByLabel(label, { exact: typeof label === 'string' })).last();
}

/** Text on the screen in front. */
export function text(page: Page, value: string | RegExp): Locator {
  return inFront(page.getByText(value)).last();
}

export async function openTab(page: Page, name: 'Home' | 'Grades' | 'Upcoming' | 'Settings') {
  await page.getByRole('tab', { name }).or(page.getByRole('link', { name })).first().click();
  // The router switches a moment after the tap.
  const title = name === 'Home' ? /^Good (morning|afternoon|evening)/ : name;
  await expect(inFront(page.getByRole('heading', { name: title, level: 1, exact: true }))).toBeVisible();
}

/** Opens the app signed out (each test gets its own empty browser). */
export async function launch(page: Page) {
  await page.goto('/');
  await expect(button(page, 'Sign in')).toBeVisible({ timeout: 60_000 });
}

export async function signIn(page: Page, email = ACCOUNT.email, password = ACCOUNT.password) {
  await launch(page);
  await field(page, 'Username or email').fill(email);
  await field(page, 'Password').fill(password);
  await button(page, 'Sign in').click();
  await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ })).toBeVisible({
    timeout: 30_000,
  });
  // The account's gradebook has arrived (classes, or the empty state).
  await expect(text(page, /^(Your classes|Let's add your classes)$/)).toBeVisible({ timeout: 30_000 });
}

/** Waits until nothing is waiting to be sent to the cloud. */
export async function waitForSync(page: Page) {
  await openTab(page, 'Grades');
  await expect(text(page, /^Synced /)).toBeVisible({ timeout: 30_000 });
  await expect(text(page, /waiting/)).toHaveCount(0);
}
