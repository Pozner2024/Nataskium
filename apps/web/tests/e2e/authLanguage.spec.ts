import { expect, test, type Page } from '@playwright/test'

const AUTH_PAGES = ['/auth/login', '/auth/register', '/auth/forgot', '/auth/reset-password', '/auth/verify-email', '/auth/link-google']
const TOKEN = 'qa-Reset_0123456789abcdefghijklmnopqrstuvwx'
const SESSION = {
  accessToken: 'e2e-access-token',
  teacher: { id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b', email: 'qa-anna@example.test', displayName: 'Anna', hasPassword: true, hasGoogle: false },
}

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

function collectI18nProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (/intlify|vue-i18n|Not found '|message compilation|hydrat/i.test(message.text())) problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))
  return problems
}

test.describe('авторизация на двух языках', () => {
  for (const path of AUTH_PAGES) {
    test(`${path}: на английской версии нет русских слов, кроме названия языка, и нет ошибок i18n`, async ({ page }) => {
      const problems = collectI18nProblems(page)

      await page.goto(`/en${path}#token=${TOKEN}`)
      await waitForHydration(page)
      await expect(page.locator('h1')).toBeVisible()

      const text = await page.locator('body').evaluate((body) => (body as HTMLElement).innerText)
      expect(text.match(/[А-Яа-яЁё]+/g)?.filter((word: string) => word !== 'Русский') ?? []).toEqual([])
      expect(problems).toEqual([])
    })

    test(`${path}: на русской версии нет ошибок i18n`, async ({ page }) => {
      const problems = collectI18nProblems(page)

      await page.goto(`${path}#token=${TOKEN}`)
      await waitForHydration(page)
      await expect(page.locator('h1')).toBeVisible()

      expect(problems).toEqual([])
    })
  }

  test('смена языка на странице входа оставляет на странице входа', async ({ page }) => {
    await page.goto('/auth/login')
    await waitForHydration(page)

    const switcher = page.locator('.language-switcher')
    await switcher.locator('summary').dispatchEvent('click')
    // dispatchEvent: на dev-сервере панель Nuxt DevTools перехватывает настоящие клики внизу по центру
    await switcher.getByRole('link', { name: 'English' }).dispatchEvent('click')

    await expect(page).toHaveURL(/\/en\/auth\/login$/)
    await expect(page.locator('h1')).toHaveText('Sign in')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('ссылки под формой входа ведут на английские страницы', async ({ page }) => {
    await page.goto('/en/auth/login')
    await waitForHydration(page)

    await expect(page.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/en/auth/forgot')
    await expect(page.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/en/auth/register')
    await expect(page.locator('.auth-layout__logo')).toHaveAttribute('href', '/en')
  })

  test('пустая форма: подсказки у полей на языке страницы', async ({ page }) => {
    await page.goto('/en/auth/login')
    await waitForHydration(page)
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('.auth-field__error')).toHaveText(['Enter your email', 'Enter a password'])

    await page.goto('/auth/login')
    await waitForHydration(page)
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('.auth-field__error')).toHaveText(['Введите почту', 'Введите пароль'])
  })

  test('ошибка схемы с параметром: «at least 4 characters» на английском', async ({ page }) => {
    await page.goto('/en/auth/register')
    await waitForHydration(page)
    await page.getByLabel('Email').fill('qa-anna@example.test')
    await page.getByLabel('Password', { exact: true }).fill('abc')
    await page.locator('button[type="submit"]').click()

    await expect(page.locator('.auth-field__error')).toHaveText('The password must be at least 4 characters')
  })

  test('ответы API по статусам: 401 и 429 на английском', async ({ page }) => {
    let status = 401
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ status, headers: status === 429 ? { 'retry-after': '170' } : {}, json: { error: 'x' } }))
    await page.goto('/en/auth/login')
    await waitForHydration(page)
    await page.getByLabel('Email').fill('qa-anna@example.test')
    await page.getByLabel('Password', { exact: true }).fill('qa-correct-horse')

    await page.locator('button[type="submit"]').click()
    await expect(page.locator('.auth-card__alert-text')).toHaveText('Wrong email or password')

    status = 429
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('.auth-card__alert-text')).toHaveText('Too many attempts. Try again in 3 min.')
  })

  test('вход на английской версии ведёт на английскую главную', async ({ page }) => {
    await page.route('**/api/auth/login', (route) => route.fulfill({ json: SESSION }))
    await page.goto('/en/auth/login')
    await waitForHydration(page)
    await page.getByLabel('Email').fill('qa-anna@example.test')
    await page.getByLabel('Password', { exact: true }).fill('qa-correct-horse')

    await page.locator('button[type="submit"]').click()

    await expect(page).toHaveURL(/\/en$/)
  })

  test('вход через Google вернулся с ошибкой: текст на языке страницы входа', async ({ page }) => {
    await page.goto('/en/auth/login?error=google_cancelled')
    await waitForHydration(page)

    await expect(page.locator('.auth-card__alert-text')).toHaveText('Google sign-in was cancelled')
  })

  test.describe('язык уходит в запросах, на которые API отвечает письмом', () => {
    const LOCALES = [
      ['/en', 'en'],
      ['', 'ru'],
    ] as const

    for (const [prefix, locale] of LOCALES) {
      test(`${prefix || '/'}: регистрация отправляет locale=${locale}`, async ({ page }) => {
        let body: unknown
        await page.route('**/api/auth/register', (route) => {
          body = route.request().postDataJSON()
          return route.fulfill({ status: 202, json: { message: 'ok' } })
        })
        await page.goto(`${prefix}/auth/register`)
        await waitForHydration(page)
        await page.locator('input[type="email"]').fill('qa-anna@example.test')
        await page.locator('input[type="password"]').fill('qa-correct-horse-1957')

        await page.locator('button[type="submit"]').click()

        await expect.poll(() => body).toMatchObject({ email: 'qa-anna@example.test', locale })
      })

      test(`${prefix || '/'}: запрос сброса отправляет locale=${locale}`, async ({ page }) => {
        let body: unknown
        await page.route('**/api/auth/forgot-password', (route) => {
          body = route.request().postDataJSON()
          return route.fulfill({ status: 202, json: { message: 'ok' } })
        })
        await page.goto(`${prefix}/auth/forgot`)
        await waitForHydration(page)
        await page.locator('input[type="email"]').fill('qa-anna@example.test')

        await page.locator('button[type="submit"]').click()

        await expect.poll(() => body).toEqual({ email: 'qa-anna@example.test', locale })
      })

      test(`${prefix || '/'}: сброс пароля отправляет locale=${locale}, токен остаётся только в теле`, async ({ page }) => {
        let body: unknown
        await page.route('**/api/auth/reset-password', (route) => {
          body = route.request().postDataJSON()
          return route.fulfill({ status: 204 })
        })
        await page.goto(`${prefix}/auth/reset-password#token=${TOKEN}`)
        await waitForHydration(page)
        await page.locator('input[type="password"]').fill('qa-new-staple-battery-2026')

        await page.locator('button[type="submit"]').click()

        await expect.poll(() => body).toEqual({ token: TOKEN, password: 'qa-new-staple-battery-2026', locale })
      })

      test(`${prefix || '/'}: кнопка Google ведёт на старт с locale=${locale}`, async ({ page }) => {
        await page.goto(`${prefix}/auth/login`)
        await waitForHydration(page)

        await expect(page.locator('.auth-card__google')).toHaveAttribute('href', `/api/auth/google/start?locale=${locale}`)
      })
    }
  })
})
