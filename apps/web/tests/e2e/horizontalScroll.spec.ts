import { expect, test, type Page } from '@playwright/test'

const MISSING_ROUTE = '/no-such-page'
const ROUTES = ['/', MISSING_ROUTE]
const NARROW_WIDTHS = [320, 375]
const VIEWPORT_HEIGHT = 800

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

test.describe('Нет горизонтальной прокрутки', () => {
  for (const width of NARROW_WIDTHS) {
    for (const route of ROUTES) {
      test(`${route} на ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
        await page.goto(route)
        await waitForHydration(page)

        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      })
    }

    test(`открытое меню на ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await page.goto('/')
      await waitForHydration(page)

      await page.locator('.app-header__burger').click()
      await expect(page.locator('.app-header__login')).toBeVisible()

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      const box = await page.locator('.app-header__login').boundingBox()
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    })
  }
})
