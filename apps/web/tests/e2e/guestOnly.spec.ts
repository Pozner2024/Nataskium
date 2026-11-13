import { expect, test, type Page } from '@playwright/test'

const SIGNED_IN_HINT_KEY = 'nataskium-signed-in'
const SESSION = {
  accessToken: 'e2e-access-token',
  teacher: {
    id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
    email: 'qa-anna@example.test',
    displayName: 'Анна',
    hasPassword: true,
    hasGoogle: false,
  },
}

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

// API подменён: проверяется поведение сайта, настоящая cookie-цепочка — в интеграционных тестах API
async function signInOnReload(page: Page) {
  await page.addInitScript((key) => {
    if (window.top === window) localStorage.setItem(key, '1')
  }, SIGNED_IN_HINT_KEY)
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ json: SESSION }))
}

test.describe('страницы входа для вошедшего учителя', () => {
  test('вошедший учитель открывает /auth/login — попадает в кабинет', async ({ page }) => {
    await signInOnReload(page)

    await page.goto('/auth/login')
    await waitForHydration(page)

    await expect(page).toHaveURL(/\/teacher$/)
  })

  test('вошедший учитель открывает /en/auth/login — попадает в кабинет на английском', async ({ page }) => {
    await signInOnReload(page)

    await page.goto('/en/auth/login')
    await waitForHydration(page)

    await expect(page).toHaveURL(/\/en\/teacher$/)
  })
})
