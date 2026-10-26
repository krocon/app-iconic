import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the Angular dev server in a browser (no Tauri backend – the facades
 * report `backend_unavailable`, the UI must stay usable). Install the browser once with
 * `pnpm e2e:install`. The real desktop app is checked under Xvfb (CLAUDE.md §8).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:1450',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:1450',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
