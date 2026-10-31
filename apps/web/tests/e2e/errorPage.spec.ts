import { expect, test, type Page } from '@playwright/test'

const MISSING_ROUTE = '/no-such-page'
const NARROW_WIDTHS = [320, 390]
const VIEWPORT_HEIGHT = 800
const INTERNAL_DETAILS = 'database password leaked'
const WHITE = 'rgb(255, 255, 255)'

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

function homeLink(page: Page) {
  return page.getByRole('link', { name: 'На главную' })
}

async function expectHomePage(page: Page) {
  await expect(page).toHaveURL('/')
  await expect(page.locator('.home-hero')).toBeVisible()
  await expect(page.locator('.error-page')).toHaveCount(0)
}

test.describe('Страница ошибки', () => {
  test('несуществующий адрес отдаёт 404 со своей страницей', async ({ page }) => {
    const response = await page.goto(MISSING_ROUTE)

    expect(response?.status()).toBe(404)
    await expect(page.locator('.error-page__code')).toHaveText('404')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('h1')).toHaveText('Такой страницы нет')
    await expect(page).toHaveTitle('Такой страницы нет')
  })

  test('закрыта от индексации', async ({ page }) => {
    await page.goto(MISSING_ROUTE)

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('кнопка ведёт на главную', async ({ page }) => {
    await page.goto(MISSING_ROUTE)
    await waitForHydration(page)

    await homeLink(page).click()

    await expectHomePage(page)
  })

  test('средняя кнопка мыши открывает главную в новой вкладке', async ({ context, page }) => {
    await page.goto(MISSING_ROUTE)
    await waitForHydration(page)

    const [newTab] = await Promise.all([context.waitForEvent('page'), homeLink(page).click({ button: 'middle' })])

    await expectHomePage(newTab)
    await expect(page.locator('.error-page')).toBeVisible()
  })

  test('ссылка выглядит как кнопка', async ({ page }) => {
    await page.goto(MISSING_ROUTE)

    await expect(homeLink(page)).toHaveCSS('text-decoration-line', 'none')
    await expect(homeLink(page)).toHaveCSS('color', WHITE)
  })

  test.describe('без JS', () => {
    test.use({ javaScriptEnabled: false })

    test('кнопка ведёт на главную', async ({ page }) => {
      await page.goto(MISSING_ROUTE)

      await homeLink(page).click()

      await expectHomePage(page)
    })
  })

  test('из ошибки 500 на главной кнопка возвращает на главную', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    await page.evaluate((message) => {
      window.useNuxtApp!().payload.error = { status: 500, message } as never
    }, INTERNAL_DETAILS)
    await expect(page.locator('.error-page')).toBeVisible()

    await homeLink(page).click()

    await expectHomePage(page)
  })

  test('ошибка 500 показывает свой текст и не раскрывает детали с сервера', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)

    // Маршрута, который падает на сервере, нет: ставим ошибку приложения так же, как это делает showError()
    await page.evaluate((message) => {
      window.useNuxtApp!().payload.error = { status: 500, message } as never
    }, INTERNAL_DETAILS)

    await expect(page.locator('.error-page__code')).toHaveText('500')
    await expect(page.locator('h1')).toHaveText('Что-то пошло не так')
    await expect(page.locator('.error-page')).not.toContainText(INTERNAL_DETAILS)
  })

  for (const width of NARROW_WIDTHS) {
    test(`нет горизонтальной прокрутки на ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await page.goto(MISSING_ROUTE)
      await waitForHydration(page)

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }
})
