import { expect, test, type Page } from '@playwright/test'

// Служебная страница есть только в режиме разработки, E2E идут на dev-сервере.
// Там своя копия сцены, но экземпляр с главной при переходе размонтируется
const OTHER_ROUTE = '/nat'
// Сразу после нажатия ждёт отложенная вспышка, через это время уже идёт сама вспышка
const LEAVE_DELAYS_MS = [0, 1750]
// Дольше задержки ответа и вспышки вместе: таймеры, оставшиеся после ухода, успели бы сработать
const SCENE_TIMERS_MS = 2500

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

function collectProblems(page: Page) {
  const problems: string[] = []
  page.on('pageerror', error => problems.push(error.message))
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) problems.push(message.text())
  })
  return problems
}

async function pressScene(page: Page) {
  await page.goto('/')
  await waitForHydration(page)
  await page.locator('.nat-students').click()
}

test.describe('NatStudents на главной', () => {
  for (const delayMs of LEAVE_DELAYS_MS) {
    test(`переход внутри приложения через ${delayMs} мс после нажатия без ошибок`, async ({ page }) => {
      const problems = collectProblems(page)
      await pressScene(page)
      await page.waitForTimeout(delayMs)

      await page.evaluate(route => window.useNuxtApp!().$router.push(route), OTHER_ROUTE)
      await expect(page).toHaveURL(OTHER_ROUTE)
      await page.waitForTimeout(SCENE_TIMERS_MS)

      expect(problems).toEqual([])
    })

    test(`полная перезагрузка через ${delayMs} мс после нажатия без ошибок`, async ({ page }) => {
      const problems = collectProblems(page)
      await pressScene(page)
      await page.waitForTimeout(delayMs)

      await page.goto(OTHER_ROUTE)
      await waitForHydration(page)

      expect(problems).toEqual([])
    })
  }
})
