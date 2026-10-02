import { defineConfig, devices } from '@playwright/test'

const HOST = '127.0.0.1'
const PORT = 5173
const BASE_URL = `http://${HOST}:${PORT}`
const isCI = process.env.CI !== undefined

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // exactOptionalPropertyTypes forbids an explicit undefined, so omit to use the default.
  ...(isCI ? { workers: 1 } : {}),
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // strictPort keeps the harness from silently testing a different Vite port.
  webServer: {
    command: `npm run dev -- --host ${HOST} --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
