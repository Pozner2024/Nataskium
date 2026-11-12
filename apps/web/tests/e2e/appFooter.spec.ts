import { expect, test, type Page } from '@playwright/test'

const HYDRATION_MESSAGE = /hydrat/i
const ROWS = '.footer-nav__list > .footer-nav__item:not(.footer-nav__item--language) > *'
const ROWS_COUNT = 11
// 32px — решение пользователя 2026-11-12, ниже рекомендуемых 44px
const MIN_ROW_HEIGHT_PX = 32
const NARROW_WIDTHS = [320, 375]
const VIEWPORT_HEIGHT = 800
const WHITE = 'rgb(255, 255, 255)'
const BLUE_LIGHT = 'rgb(147, 176, 249)'

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

test.describe('AppFooter', () => {
  test('выводит год без расхождения при гидратации', async ({ page }) => {
    const messages: string[] = []
    page.on('console', message => messages.push(message.text()))

    await page.goto('/')
    await waitForHydration(page)

    await expect(page.locator('.app-footer__copyright')).toHaveText(`© ${new Date().getFullYear()}`)
    expect(messages.filter(message => HYDRATION_MESSAGE.test(message))).toEqual([])
  })

  async function expectRowsTallEnough(page: Page) {
    const rows = page.locator(ROWS)
    await expect(rows).toHaveCount(ROWS_COUNT)
    const heights = await rows.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
    expect(heights.filter(height => height < MIN_ROW_HEIGHT_PX)).toEqual([])
  }

  test('все строки футера не ниже 32px', async ({ page }) => {
    await page.goto('/')

    await expectRowsTallEnough(page)
  })

  for (const width of NARROW_WIDTHS) {
    test(`строки футера не ниже 32px на ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await page.goto('/')

      await expectRowsTallEnough(page)
    })
  }

  test('ссылка другого языка — ссылка и отзывается на наведение', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'нужна мышь')
    await page.goto('/')
    const switcher = page.locator('.footer-nav__item--language .language-switcher')
    await switcher.locator('summary').click()
    const language = switcher.getByRole('link', { name: 'English' })
    await language.scrollIntoViewIfNeeded()
    await expect(language).toHaveAttribute('href', '/en')
    const background = () => language.evaluate(element => getComputedStyle(element).backgroundColor)
    const idle = await background()

    await language.hover()

    await expect.poll(background).not.toBe(idle)
  })

  test('ссылка футера отзывается на наведение и нажатие', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'нужна мышь')
    await page.goto('/')
    const link = page.locator('.footer-nav__link').first()
    await link.scrollIntoViewIfNeeded()

    await link.hover()
    await expect(link).toHaveCSS('color', WHITE)

    await page.mouse.down()
    await expect(link).toHaveCSS('color', BLUE_LIGHT)
    await page.mouse.move(0, 0)
    await page.mouse.up()
  })
})
