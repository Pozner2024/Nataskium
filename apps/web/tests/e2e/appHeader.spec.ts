import { expect, test, type Page } from '@playwright/test'

// Служебная страница есть только в режиме разработки, E2E идут на dev-сервере
const OTHER_ROUTE = '/nat'
const ACTIVE_ITEM_CLASS = /app-header__item--active/

// До гидратации SSR-разметка на клики не реагирует. __vue_app__ не годится как сигнал:
// он появляется раньше, чем гидратируются асинхронные части, в том числе layout с шапкой
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

test.describe('AppHeader', () => {
  test('шторка видна только пока меню открыто', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    const item = page.locator('.app-header__item').first()
    const burger = page.locator('.app-header__burger')

    await expect(item).toBeHidden()

    await burger.click()
    await expect(item).toBeVisible()

    await burger.click()
    await expect(item).toBeHidden()
  })

  test('подсвечен только пункт текущей страницы', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.app-header__item').first()).toHaveClass(ACTIVE_ITEM_CLASS)

    await page.goto(OTHER_ROUTE)
    await expect(page.locator('.app-header__item').first()).not.toHaveClass(ACTIVE_ITEM_CLASS)
  })

  test.describe('закрытие меню', () => {
    const burger = (page: Page) => page.locator('.app-header__burger')

    async function openMenu(page: Page, route = '/') {
      await page.goto(route)
      await waitForHydration(page)
      await burger(page).click()
      await expect(burger(page)).toHaveAttribute('aria-expanded', 'true')
      await expect.poll(() => pageOverflow(page)).toBe('hidden')
    }

    function pageOverflow(page: Page) {
      return page.evaluate(() => document.documentElement.style.overflow)
    }

    async function expectMenuClosed(page: Page) {
      await expect(burger(page)).toHaveAttribute('aria-expanded', 'false')
      await expect.poll(() => pageOverflow(page)).toBe('')
      await expect(burger(page)).toBeFocused()
    }

    test('клик по «Главная» на главной закрывает меню', async ({ page }) => {
      await openMenu(page)
      await page.locator('.app-header__item').first().click()
      await expectMenuClosed(page)
    })

    test('клик по логотипу на главной закрывает меню', async ({ page }) => {
      await openMenu(page)
      await page.locator('.app-header__logo').click()
      await expectMenuClosed(page)
    })

    test('клик по логотипу при закрытом меню не переводит фокус на бургер', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)
      await page.locator('.app-header__logo').click()

      await expect(page.locator('.app-header__logo')).toBeFocused()
      await expect(burger(page)).toHaveAttribute('aria-expanded', 'false')
    })

    test('бургер закрывает меню', async ({ page }) => {
      await openMenu(page)
      await burger(page).click()
      await expectMenuClosed(page)
    })

    test('затемнение закрывает меню', async ({ page }) => {
      await openMenu(page)
      const { height, width } = page.viewportSize()!
      // Выше панели Nuxt DevTools: на dev-сервере она перехватывает клики внизу по центру
      await page.locator('.app-header__dim').click({ position: { x: width / 2, y: height * 0.7 } })
      await expectMenuClosed(page)
    })

    test('Escape закрывает меню', async ({ page }) => {
      await openMenu(page)
      await page.keyboard.press('Escape')
      await expectMenuClosed(page)
    })

    test('Escape закрывает меню после клика по пустому месту шторки', async ({ page }) => {
      await openMenu(page)
      await page.locator('.app-header__menu').click({ position: { x: 4, y: 4 } })
      await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true)

      await page.keyboard.press('Escape')

      await expectMenuClosed(page)
    })

    test('при закрытом меню Tab идёт обычным порядком', async ({ page }) => {
      await page.goto('/')
      await waitForHydration(page)
      await page.locator('.app-header__logo').focus()

      await page.keyboard.press('Tab')

      await expect(burger(page)).toBeFocused()
    })

    test('смена маршрута закрывает меню', async ({ page }) => {
      await openMenu(page, OTHER_ROUTE)
      await page.locator('.app-header__item').first().click()
      await expect(page).toHaveURL('/')
      await expectMenuClosed(page)
    })
  })
})
