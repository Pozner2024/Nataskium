import { expect, test, type Page } from '@playwright/test'

const LOCALE_COOKIE = 'nataskium-locale'

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

async function chooseLanguage(page: Page, name: 'Русский' | 'English') {
  await page.locator('.app-header__burger').click()
  const switcher = page.locator('.app-header__menu .language-switcher')
  await switcher.locator('summary').click()
  const link = switcher.getByRole('link', { name })
  await expect(link).toBeVisible()
  await link.scrollIntoViewIfNeeded()
  await link.click()
  await expect(page.locator('.app-header__burger')).toHaveAttribute('aria-expanded', 'false')
}

test.describe('язык интерфейса', () => {
  test('русский браузер остаётся на /, английский уходит на /en', async ({ browser }) => {
    const russian = await browser.newPage({ locale: 'ru-RU' })
    await russian.goto('/')
    await expect(russian).toHaveURL(/\/$/)
    await expect(russian.locator('html')).toHaveAttribute('lang', 'ru')

    const english = await browser.newPage({ locale: 'en-US' })
    await english.goto('/')
    await expect(english).toHaveURL(/\/en$/)
    await expect(english.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('выбор английского: адрес /en, lang и cookie, следующий заход на / остаётся на английском', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)

    await chooseLanguage(page, 'English')

    await expect(page).toHaveURL(/\/en$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    expect((await page.context().cookies()).find((cookie) => cookie.name === LOCALE_COOKIE)?.value).toBe('en')

    await page.goto('/')
    await expect(page).toHaveURL(/\/en$/)
  })

  test('возврат на русский: адрес /, русский сохраняется и при заходе на корень', async ({ page }) => {
    await page.goto('/en')
    await waitForHydration(page)

    await chooseLanguage(page, 'Русский')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
  })

  test('ссылка письма без префикса не теряет токен и не перенаправляет', async ({ page }) => {
    const token = 'qa-Reset_0123456789abcdefghijklmnopqrstuvwx'
    await page.context().addCookies([{ name: LOCALE_COOKIE, value: 'en', url: 'http://localhost:3000' }])

    await page.goto(`/auth/reset-password#token=${token}`)
    await waitForHydration(page)

    await expect(page).toHaveURL(/\/auth\/reset-password$/)
    await expect(page.getByText('Ссылка неполная')).toHaveCount(0)
  })

  test('переключатель есть в футере и ведёт на английскую версию', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)

    const switcher = page.locator('.footer-nav__item--language .language-switcher')
    await switcher.locator('summary').click()
    const footerLink = switcher.getByRole('link', { name: 'English' })
    await footerLink.scrollIntoViewIfNeeded()
    await footerLink.click()

    await expect(page).toHaveURL(/\/en$/)
  })

  test('английская версия: шапка и футер на английском, ссылки с префиксом /en', async ({ page }) => {
    await page.goto('/en')
    await waitForHydration(page)
    await page.locator('.app-header__burger').click()

    const menu = page.locator('.app-header__menu')
    await expect(menu.locator('.app-header__list a')).toHaveText(['Home', 'Activity library', 'Pricing plans', 'FAQ', 'Help center'])
    await expect(menu.locator('.app-header__login')).toHaveText('Sign in')
    await expect(menu.locator('.app-header__login')).toHaveAttribute('href', '/en/auth/login')
    await expect(menu.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/en/auth/register')
    await expect(page.locator('.footer-nav__title')).toHaveText(['Navigation', 'About'])
    await expect(page.locator('.footer-nav__link').first()).toHaveAttribute('href', '/en')
  })

  test('английская версия: переход по «Sign in» остаётся на английском', async ({ page }) => {
    await page.goto('/en')
    await waitForHydration(page)
    await page.locator('.app-header__burger').click()
    const login = page.locator('.app-header__login')
    const box = await login.boundingBox()
    // У правого края: на dev-сервере панель Nuxt DevTools перехватывает клики внизу по центру
    await login.click({ position: { x: box!.width - 10, y: box!.height / 2 } })

    await expect(page).toHaveURL(/\/en\/auth\/login$/)
  })

  test('на /en нет предупреждений о расхождении при гидратации', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (message) => {
      if (/hydrat/i.test(message.text())) warnings.push(message.text())
    })

    await page.goto('/en')
    await waitForHydration(page)

    expect(warnings).toEqual([])
  })

  test('на английской главной нет русских слов, кроме названия языка', async ({ page }) => {
    await page.goto('/en')
    await waitForHydration(page)

    const text = await page.locator('body').evaluate((body) => (body as HTMLElement).innerText)
    const cyrillic = text.match(/[А-Яа-яЁё]+/g)?.filter((word: string) => word !== 'Русский') ?? []

    expect(cyrillic).toEqual([])
  })

  test('страница 404 на английской версии: текст и кнопка на английском, кнопка ведёт на /en', async ({ page }) => {
    await page.goto('/en/no-such-page')
    await waitForHydration(page)

    await expect(page.locator('h1')).toHaveText('This page does not exist')
    await expect(page.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('страница 404 на русской версии остаётся русской', async ({ page }) => {
    await page.goto('/no-such-page')
    await waitForHydration(page)

    await expect(page.locator('h1')).toHaveText('Такой страницы нет')
    await expect(page.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/')
  })
})
