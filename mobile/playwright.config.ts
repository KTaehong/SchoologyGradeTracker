/**
 * User-style tests: a real browser taps through the web build of the app at
 * phone size, signed in to a test account on the hosted backend.
 *
 *   npm run test:e2e      the scripted journeys (sign-in, gradebook, calendar)
 *   npm run test:monkey   random taps and junk typing ("stupid user" test)
 *
 * The test account comes from E2E_EMAIL / E2E_PASSWORD, read from the
 * git-ignored mobile/.env.local. See e2e/README.md.
 */
import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read E2E_* settings from .env.local without adding a dependency.
const envFile = join(__dirname, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(E2E_[A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

const PORT = Number(process.env.E2E_PORT ?? 8081);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts$/,
  // One test account is shared, so journeys run one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  outputDir: 'e2e/.results',
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: { CI: '1', BROWSER: 'none' },
  },
});
