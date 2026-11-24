/**
 * Linking the Schoology calendar. Schoology itself is not contacted: the test
 * answers the calendar link with a small iCal file, so it checks everything
 * the app does with a link (checking it, saving it per account, showing what
 * is due, updating, disconnecting).
 */
import type { Page } from '@playwright/test';

import { answerDialogs, button, expect, field, hasAccount, openTab, signIn, test, text, waitForSync } from './support/app';

const FEED_HOST = 'https://calendar.e2e-test.example';
const GOOD_LINK = 'webcal://calendar.e2e-test.example/calendar/feed/ical/1/secret/ical.ics';

const pad = (n: number) => String(n).padStart(2, '0');
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

function ical(titles: string[]): string {
  const events = titles.flatMap((title, i) => [
    'BEGIN:VEVENT',
    `UID:e2e-${i}@schoology`,
    `DTSTART:${stamp(inDays(i + 1))}`,
    `SUMMARY:${title}`,
    'END:VEVENT',
  ]);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');
}

/** Stands in for Schoology. Returns a way to change what the feed holds. */
async function fakeSchoology(page: Page) {
  let titles = ['E2E Quiz on Limits', 'E2E Lab Report'];
  await page.route(`${FEED_HOST}/**`, (route) => {
    const url = route.request().url();
    if (url.includes('expired')) return route.fulfill({ status: 404, body: 'Not found' });
    if (url.includes('login-page')) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Log in</html>' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'text/calendar',
      headers: { 'access-control-allow-origin': '*' },
      body: ical(titles),
    });
  });
  return (next: string[]) => {
    titles = next;
  };
}

async function openCalendarScreen(page: Page) {
  await openTab(page, 'Settings');
  await button(page, /^Calendar feed/).click();
  await expect(page.getByRole('heading', { name: 'Schoology calendar' }).filter({ visible: true })).toBeVisible();
}

test.describe('Schoology calendar', () => {
  test.skip(!hasAccount, 'set E2E_EMAIL and E2E_PASSWORD in mobile/.env.local');

  test('link, see what is due, update, and disconnect', async ({ page }) => {
    answerDialogs(page, 'accept');
    const setFeed = await fakeSchoology(page);
    await signIn(page);
    await openCalendarScreen(page);

    // Leftover link from an interrupted run: start clean.
    if (await button(page, 'Disconnect').isVisible().catch(() => false)) {
      await button(page, 'Disconnect').click();
      await expect(button(page, 'Connect')).toBeVisible();
    }

    // Links that cannot work are explained, and nothing is saved.
    const connect = button(page, 'Connect');
    await expect(connect).toBeDisabled();
    await field(page, 'Calendar link').fill('just some words');
    await connect.click();
    await expect(text(page, /does not look like a calendar link/)).toBeVisible();
    await field(page, 'Calendar link').fill(`${FEED_HOST}/expired.ics`);
    await connect.click();
    await expect(text(page, /Schoology did not accept this calendar link/)).toBeVisible();
    await field(page, 'Calendar link').fill(`${FEED_HOST}/login-page`);
    await connect.click();
    await expect(text(page, /did not return a calendar/)).toBeVisible();

    // An empty feed clears items an interrupted run left in the account.
    setFeed([]);
    await field(page, 'Calendar link').fill(GOOD_LINK);
    await connect.click();
    await expect(text(page, /^Calendar updated: 0 new/)).toBeVisible();
    await button(page, 'Disconnect').click();
    await expect(connect).toBeVisible();
    setFeed(['E2E Quiz on Limits', 'E2E Lab Report']);

    // The real thing, as Schoology shows it (webcal://).
    await field(page, 'Calendar link').fill(GOOD_LINK);
    await connect.click();
    await expect(text(page, 'Connected to your Schoology calendar')).toBeVisible();
    await expect(text(page, 'Calendar updated: 2 new, 0 changed, 0 removed.')).toBeVisible();

    // The screen stays usable after connecting.
    await expect(button(page, 'Update now')).toBeEnabled();
    await expect(button(page, 'Disconnect')).toBeEnabled();

    setFeed(['E2E Quiz on Limits', 'E2E Lab Report', 'E2E Essay Draft']);
    await button(page, 'Update now').click();
    await expect(text(page, 'Calendar updated: 1 new, 0 changed, 0 removed.')).toBeVisible();
    await expect(button(page, 'Update now')).toBeEnabled();

    // Upcoming and Home show the items.
    await page.goBack();
    await openTab(page, 'Upcoming');
    for (const title of ['E2E Quiz on Limits', 'E2E Lab Report', 'E2E Essay Draft']) {
      await expect(text(page, title)).toBeVisible();
    }
    await expect(text(page, /From your Schoology calendar/)).toBeVisible();
    await openTab(page, 'Home');
    await expect(text(page, 'Due soon')).toBeVisible();

    // The link is still there after opening the app again.
    await page.goto('/');
    await expect(text(page, 'Your classes')).toBeVisible({ timeout: 60_000 });
    await openTab(page, 'Settings');
    await expect(text(page, /^Connected · updated/)).toBeVisible();

    // Disconnect removes the items, and the form is ready for a new link.
    await button(page, /^Calendar feed/).click();
    await button(page, 'Disconnect').click();
    await expect(field(page, 'Calendar link')).toBeVisible();
    await expect(button(page, 'Connect')).toHaveText('Connect');
    await page.goBack();
    await openTab(page, 'Upcoming');
    await expect(text(page, 'E2E Quiz on Limits')).toHaveCount(0);
    await waitForSync(page);
  });
});
