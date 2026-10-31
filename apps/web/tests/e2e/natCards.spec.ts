import { expect, test, type Page } from '@playwright/test'

const CARDS_COUNT = 6
const HERO_CARDS = '.home-hero [data-testid="nat-card"]'

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

async function scrollToBottom(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
}

test.describe('NatCards при prefers-reduced-motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('свежая загрузка сверху показывает все карточки', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)

    await expect(page.locator(HERO_CARDS)).toHaveCount(CARDS_COUNT)
  })

  test('перезагрузка внизу страницы и прокрутка вверх показывают все карточки', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    await scrollToBottom(page)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

    await page.reload()
    await waitForHydration(page)
    // Без этого проверка ничего не значит: сцена должна смонтироваться за экраном
    await expect(page.locator('.home-hero')).not.toBeInViewport()

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))

    await expect(page.locator(HERO_CARDS)).toHaveCount(CARDS_COUNT)
  })
})
