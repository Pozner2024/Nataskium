import { defineConfig, devices } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'
const DEV_SERVER_TIMEOUT_MS = 120_000

export default defineConfig({
  testDir: 'tests/e2e',
  // Русский браузер: с английским корень сайта перенаправляет на /en. Определение языка проверяет languageSwitch.spec.ts
  use: { baseURL: BASE_URL, locale: 'ru-RU' },
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: DEV_SERVER_TIMEOUT_MS,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
})
