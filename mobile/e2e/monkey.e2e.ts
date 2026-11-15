/**
 * The "stupid user" test: taps whatever is on screen at random, types junk
 * into every box, presses Enter and Back at odd moments — and expects the app
 * to stay standing. It fails when the app throws an error, shows a blank
 * screen, loses the signed-in student, or leaves the app's own address.
 *
 * It is safe for the shared test account: nothing it does reaches the cloud
 * (uploads are blocked) and every "are you sure?" is answered No.
 *
 *   MONKEY_SEED=1234   replay one exact run (the seed is printed on failure)
 *   MONKEY_STEPS=400   a longer run (default 150)
 */
import type { Page } from '@playwright/test';

import { answerDialogs, expect, hasAccount, signIn, test } from './support/app';

const SEED = Number(process.env.MONKEY_SEED ?? Date.now() % 1_000_000);
const STEPS = Number(process.env.MONKEY_STEPS ?? 150);

/** A small seeded random number generator (mulberry32), so runs can be replayed. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const JUNK = [
  '',
  ' ',
  '0',
  '-1',
  '1e9',
  '99999999999999999999',
  '3.14159',
  '1,5',
  'abc',
  '😀🔥',
  '<script>alert(1)</script>',
  "Robert'); DROP TABLE students;--",
  'null',
  'x'.repeat(400),
  '12/45',
  'Feb 30',
  'webcal://nowhere.invalid/feed.ics',
  'name@',
  '    padded    ',
  '٣٤٥',
];

const TAPPABLE = '[role="button"], [role="tab"], [role="radio"], [role="switch"], [role="link"], a[href], input, textarea';

async function visibleTargets(page: Page) {
  const all = page.locator(TAPPABLE).filter({ visible: true });
  const count = await all.count();
  return { all, count };
}

test.describe('monkey test', () => {
  test.skip(!hasAccount, 'set E2E_EMAIL and E2E_PASSWORD in mobile/.env.local');
  test.setTimeout(10 * 60_000);

  test(`random taps and junk typing (seed ${SEED}, ${STEPS} steps)`, async ({ page, baseURL, appErrors }) => {
    const random = seeded(SEED);
    const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
    const log: string[] = [];

    // Nothing the monkey makes may reach the shared account.
    await page.route('**/rest/v1/rpc/push_changes', (route) => route.abort());
    await page.route('**/rest/v1/rpc/delete_my_account', (route) => route.abort());
    answerDialogs(page, 'dismiss');
    await signIn(page);

    const check = async (step: number, did: string) => {
      const where = `step ${step} (${did}), seed ${SEED}\nlast steps:\n${log.slice(-12).join('\n')}`;
      expect(new URL(page.url()).origin, `left the app at ${where}`).toBe(new URL(baseURL!).origin);
      const words = (await page.locator('body').innerText()).trim();
      expect(words.length, `blank screen at ${where}`).toBeGreaterThan(20);
      expect(words, `crash screen at ${where}`).not.toMatch(/Something went wrong|Unmatched Route|Uncaught Error/);
      const { count } = await visibleTargets(page);
      expect(count, `dead end (nothing to tap) at ${where}`).toBeGreaterThan(0);
      const signedOut = await page.getByRole('button', { name: 'Create an account', exact: true }).filter({ visible: true }).count();
      expect(signedOut, `signed out unexpectedly at ${where}`).toBe(0);
    };

    for (let step = 1; step <= STEPS; step++) {
      const roll = random();
      let did: string;
      try {
        if (roll < 0.07) {
          // The header's back arrow (the browser's own Back could leave the app).
          const back = page.getByRole('button', { name: /back$/i }).filter({ visible: true });
          did = (await back.count()) > 0 ? 'Back' : 'Back (nowhere to go)';
          if ((await back.count()) > 0) await back.last().click({ timeout: 3000 });
        } else if (roll < 0.12) {
          did = 'press Enter';
          await page.keyboard.press('Enter');
        } else if (roll < 0.17) {
          did = 'scroll';
          await page.mouse.wheel(0, (random() - 0.3) * 1500);
        } else {
          const { all, count } = await visibleTargets(page);
          if (count === 0) {
            did = 'nothing to tap';
          } else {
            const target = all.nth(Math.floor(random() * count));
            const tag = await target.evaluate((el) => el.tagName.toLowerCase());
            const name = ((await target.getAttribute('aria-label')) ?? (await target.innerText().catch(() => '')) ?? '')
              .replace(/\s+/g, ' ')
              .slice(0, 40);
            if (tag === 'input' || tag === 'textarea') {
              const junk = pick(JUNK);
              did = `type ${JSON.stringify(junk.slice(0, 20))} into "${name}"`;
              await target.fill(junk, { timeout: 3000 });
            } else {
              did = `tap "${name}"`;
              // Not the header's back arrow: its second tap lands on the screen underneath.
              const isBack = /back$/i.test(name);
              const taps = random() < 0.15 && !isBack ? 2 : 1;
              await target.click({ timeout: 3000, clickCount: taps, noWaitAfter: true });
            }
          }
        }
      } catch (error) {
        // A control that moved or closed mid-tap is normal for a monkey.
        did = `missed (${String(error).split('\n')[0].slice(0, 80)})`;
      }
      log.push(`${step}. ${did}`);
      await page.waitForTimeout(120);
      await check(step, did);
      // Name the step that made the app log an error, so it can be replayed.
      expect(appErrors, `app error at step ${step} (${did}), seed ${SEED}\nlast steps:\n${log.slice(-12).join('\n')}`).toEqual([]);
    }
    console.log(`monkey finished ${STEPS} steps with seed ${SEED}`);
  });
});
