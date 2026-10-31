import { expect, test, type Page } from '@playwright/test'

const BUTTONS = [
  { place: 'первый экран', name: 'Создать задание бесплатно' },
  { place: 'PreFooter', name: 'Присоединиться бесплатно' },
]

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

test.describe('Кнопки на главной', () => {
  for (const { place, name } of BUTTONS) {
    test(`${place}: остаётся кнопкой и нажатие ничего не ломает`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('/')
      await waitForHydration(page)
      const button = page.getByRole('button', { name })

      await expect(button).toHaveAttribute('type', 'button')
      await button.click()

      await expect(page).toHaveURL('/')
      expect(errors).toEqual([])
    })
  }
})
