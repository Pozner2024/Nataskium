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
const EDGE_POINT_PX = 10
const TEACHER_ITEMS =['Создать задание', 'Мои задания', 'Управление подпиской']

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

// API подменён: проверяется поведение сайта, настоящая cookie-цепочка — в интеграционных тестах API
async function signInOnReload(page: Page) {
  await page.addInitScript((key) => localStorage.setItem(key, '1'), SIGNED_IN_HINT_KEY)
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ json: SESSION }))
}

test.describe('меню учителя', () => {
  test('гость не шлёт refresh и видит «Войти»', async ({ page }) => {
    let refreshCalls = 0
    await page.route('**/api/auth/refresh', (route) => {
      refreshCalls++
      return route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
    })

    await page.goto('/')
    await waitForHydration(page)
    await page.locator('.app-header__burger').click()

    await expect(page.locator('.app-header__login')).toBeVisible()
    expect(refreshCalls).toBe(0)
  })

  test('после перезагрузки сессия возвращается: пункты учителя и «Выйти»', async ({ page }) => {
    await signInOnReload(page)

    await page.goto('/')
    await waitForHydration(page)
    await page.locator('.app-header__burger').click()

    await expect(page.locator('.app-header__logout')).toBeVisible()
    await expect(page.locator('.app-header__list').first().locator('a')).toHaveText(TEACHER_ITEMS)
    await expect(page.locator('.app-header__login')).toHaveCount(0)
  })

  test('«Выйти» возвращает меню гостя', async ({ page }) => {
    await signInOnReload(page)
    await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204 }))

    await page.goto('/')
    await waitForHydration(page)
    await page.locator('.app-header__burger').click()
    const logout = page.locator('.app-header__logout')
    await expect(logout).toBeVisible()
    const box = await logout.boundingBox()
    // У правого края: на dev-сервере панель Nuxt DevTools перехватывает клики внизу по центру
    await logout.click({ position: { x: box!.width - EDGE_POINT_PX, y: box!.height / 2 } })
    await expect(logout).toHaveCount(0)

    await page.locator('.app-header__burger').click()
    await expect(page.locator('.app-header__login')).toBeVisible()
    await expect(page.locator('.app-header__menu').getByText(TEACHER_ITEMS[0]!)).toHaveCount(0)
    expect(await page.evaluate((key) => localStorage.getItem(key), SIGNED_IN_HINT_KEY)).toBeNull()
  })
})
