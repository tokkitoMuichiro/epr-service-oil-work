import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { ADMIN, ADMIN_STATE, BASE_URL, E2E_PORT } from './e2e/support/env'

if (!existsSync('client/dist/index.html')) {
  throw new Error('Нет собранного клиента: выполните `npm run build --workspace=client` перед e2e')
}

const isCi = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STATE },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'node --import tsx e2e/server.mts',
    url: `${BASE_URL}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'production',
      TZ: 'Europe/Moscow',
      HOST: '127.0.0.1',
      PORT: String(E2E_PORT),
      CLIENT_DIST: 'client/dist',
      PUBLIC_URL: BASE_URL,
      SEED_DEMO: '1',
      ADMIN_LOGIN: ADMIN.login,
      ADMIN_PASSWORD: ADMIN.password,
      BITRIX_MODE: 'mock',
    },
  },
})
