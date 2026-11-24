import { ACCOUNT, answerDialogs, button, expect, field, hasAccount, launch, openTab, signIn, test, text, waitForSync } from './support/app';

test.describe('opening the app', () => {
  test('a new install starts on the sign-in screen', async ({ page }) => {
    await launch(page);
    await expect(page.getByRole('heading', { name: 'Schoology Grade Tracker' })).toBeVisible();
    await expect(field(page, 'Username or email')).toBeVisible();
  });

  test('a signed-out visitor cannot open a screen inside the app', async ({ page }) => {
    await page.goto('/grades');
    await expect(button(page, 'Sign in')).toBeVisible({ timeout: 60_000 });
    await expect(text(page, 'Your classes')).toHaveCount(0);
  });

  test('a link that leads nowhere offers the way back', async ({ page }) => {
    await page.goto('/definitely-not-a-page');
    await expect(text(page, 'Page not found')).toBeVisible({ timeout: 60_000 });
    await button(page, 'Go to sign in').click();
    await expect(button(page, 'Sign in')).toBeVisible();
  });
});

test.describe('creating an account', () => {
  test.beforeEach(async ({ page }) => {
    await launch(page);
    await button(page, 'Create an account').click();
    await field(page, 'Name').fill('Test Student');
    await field(page, /^Password/).fill('long-enough-1');
  });

  for (const email of ['bob', 'bob@', 'bob@gmail', 'bob @gmail.com', 'bob@gmail..com', '@gmail.com']) {
    test(`refuses the email "${email}" before sending anything`, async ({ page }) => {
      let sent = false;
      page.on('request', (request) => {
        if (request.url().includes('/auth/v1/signup')) sent = true;
      });
      await field(page, 'Email').fill(email);
      await button(page, 'Create account').click();
      await expect(text(page, 'Enter a real email address, such as name@gmail.com.')).toBeVisible();
      expect(sent).toBe(false);
    });
  }

  test('refuses a short password, a missing name and a bad username', async ({ page }) => {
    await field(page, 'Email').fill('someone.real@gmail.com');
    await field(page, /^Password/).fill('short');
    await button(page, 'Create account').click();
    await expect(text(page, /at least 6 characters\.$/)).toBeVisible();

    await field(page, /^Password/).fill('long-enough-1');
    await field(page, 'Username (optional)').fill('has spaces!');
    await button(page, 'Create account').click();
    await expect(text(page, /A username is 3 to 30 letters/)).toBeVisible();

    await field(page, 'Username (optional)').fill('');
    await field(page, 'Name').fill('   ');
    await button(page, 'Create account').click();
    await expect(text(page, 'Enter your name.')).toBeVisible();
  });

  test('does not reveal that an email already has an account', async ({ page }) => {
    test.skip(!hasAccount || !ACCOUNT.email.includes('@'), 'needs E2E_EMAIL');
    await field(page, 'Email').fill(ACCOUNT.email);
    await button(page, 'Create account').click();
    await expect(text(page, /If you already have an account, no email is sent/)).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe('signing in', () => {
  test.skip(!hasAccount, 'set E2E_EMAIL and E2E_PASSWORD in mobile/.env.local');

  test('explains an empty form and a wrong password', async ({ page }) => {
    await launch(page);
    await button(page, 'Sign in').click();
    await expect(text(page, 'Enter your username (or email) and password.')).toBeVisible();

    await field(page, 'Username or email').fill(ACCOUNT.email);
    await field(page, 'Password').fill('definitely-not-the-password');
    await button(page, 'Sign in').click();
    await expect(text(page, 'Wrong username or password.')).toBeVisible({ timeout: 30_000 });
  });

  test('the test account signs in with its password and sees its grades', async ({ page }) => {
    await signIn(page);
    await expect(text(page, 'Your classes')).toBeVisible();
    await openTab(page, 'Settings');
    await expect(text(page, 'Signed in')).toBeVisible();
  });

  test('a double tap on Sign in still signs in once', async ({ page }) => {
    let requests = 0;
    page.on('request', (request) => {
      if (request.url().includes('/auth/v1/token?grant_type=password')) requests++;
    });
    await launch(page);
    await field(page, 'Username or email').fill(`  ${ACCOUNT.email.toUpperCase()}  `);
    await field(page, 'Password').fill(ACCOUNT.password);
    await button(page, 'Sign in').dblclick();
    await expect(text(page, 'Your classes')).toBeVisible({ timeout: 30_000 });
    expect(requests).toBe(1);
  });

  test('opening the app again goes straight to the grades', async ({ page }) => {
    await signIn(page);
    await page.reload();
    await expect(text(page, 'Your classes')).toBeVisible({ timeout: 60_000 });
    await expect(button(page, 'Sign in')).toHaveCount(0);
  });

  test('opening the app with the server out of reach still shows the grades', async ({ page }) => {
    await signIn(page);
    await waitForSync(page);
    await page.route(/supabase\.co/, (route) => route.abort());
    // Make the saved access token look expired, as it is after an hour.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k))) {
        const session = JSON.parse(localStorage.getItem(key)!);
        localStorage.setItem(key, JSON.stringify({ ...session, expires_at: 1 }));
      }
    });
    await page.goto('/');
    await expect(text(page, 'Your classes')).toBeVisible({ timeout: 60_000 });
    await expect(button(page, 'Sign in')).toHaveCount(0);
  });

  test('Sign out returns to the sign-in screen, and Back does not get back in', async ({ page }) => {
    answerDialogs(page, 'accept');
    await signIn(page);
    await openTab(page, 'Settings');
    await button(page, /^Sign out/).click();
    await expect(button(page, 'Sign in')).toBeVisible({ timeout: 30_000 });
    await page.goBack();
    await expect(text(page, 'Your classes')).toHaveCount(0);
  });
});
