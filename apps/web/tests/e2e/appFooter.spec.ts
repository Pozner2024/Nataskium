import { expect, test, type Page } from '@playwright/test'

const HYDRATION_MESSAGE = /hydrat/i

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
})
