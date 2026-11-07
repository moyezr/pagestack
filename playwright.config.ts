import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 15_000,
  expect: { timeout: 4000 },
  reporter: 'list',
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
