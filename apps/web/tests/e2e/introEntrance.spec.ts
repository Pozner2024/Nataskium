import { expect, test, type Page } from '@playwright/test'

// Настоящие интро и вылет первого вопроса темы по умолчанию (без reduced motion): остальные спеки игр анимации выключают
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA'
// Интро темы Nataskium идёт около 6,3 с, вылет — около 3,3 с: запас на медленный dev-сервер
const INTRO_TIMEOUT_MS = 15_000
const LIMIT_SECONDS = 60
// Сразу после приземления допускаются две секунды на проверки; вылет (~3,3 с), съевший время, дал бы 0:57 и меньше
const MIN_SECONDS_AFTER_LANDING = 58

function toSeconds(clock: string): number {
  const [minutes = '0', seconds = '0'] = clock.trim().split(':')
  return Number(minutes) * 60 + Number(seconds)
}

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

async function mockApi(page: Page, timer: unknown = { mode: 'none' }) {
  const calls = { check: 0 }
  await page.route('**/api/play/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/check')) {
      calls.check += 1
      return route.fulfill({ json: { correct: [0] } })
    }
    return route.fulfill({
      json: {
        type: 'quiz',
        quiz: {
          title: 'Capitals',
          showAnswers: true,
          timer,
          version: 'v1',
          introTheme: 'nataskium-night',
          questions: [
            {
              text: 'Capital of France?',
              imageUrl: null,
              options: [{ text: 'Paris', imageUrl: null }, { text: 'Rome', imageUrl: null }],
              selectCount: 1,
            },
          ],
        },
      },
    })
  })
  return calls
}

// inert снимается с варианта, когда он приземлился
async function expectLanded(page: Page) {
  const option = page.locator('.play-question__option').first()
  await expect(option).toBeVisible({ timeout: INTRO_TIMEOUT_MS })
  await expect
    .poll(() => page.locator('.play-question__item').evaluateAll((items) => items.every((item) => !(item as HTMLElement).inert)), {
      timeout: INTRO_TIMEOUT_MS,
    })
    .toBe(true)
  await expect(page.locator('.entrance-card--entering')).toHaveCount(0)
  // Слой сигнала убран, рамка карточки — её собственная граница
  await expect(page.locator('.intro-player > svg')).toHaveCount(0)
}

test.describe('Интро темы Nataskium и вылет первого вопроса', () => {
  test('после интро вопрос вылетает в рамке, фокус на вопросе, вариант нажимается', async ({ page }) => {
    const calls = await mockApi(page)
    await page.goto(`/play/${TOKEN}`)
    await waitForHydration(page)
    await page.locator('.intro-player__start-button').click()

    await expect(page.locator('.nataskium-scene__logo')).toBeVisible()
    await expectLanded(page)
    await expect(page.locator('.entrance-card--framed .entrance-card__dot')).toHaveCount(3)
    await expect(page.locator('.play-question__text')).toBeFocused()

    await page.locator('.play-question__option', { hasText: 'Paris' }).click()
    await expect(page.locator('.play-question__option', { hasText: 'Paris' })).toHaveAttribute('aria-pressed', 'true')
    // Один ответ засчитывается сразу, кнопки «Ответить» нет
    await expect.poll(() => calls.check).toBe(1)
  })

  test('«Пропустить» сразу после «Начать»: вопрос всё равно приземляется и нажимается', async ({ page }) => {
    await mockApi(page)
    await page.goto(`/play/${TOKEN}`)
    await waitForHydration(page)
    await page.locator('.intro-player__start-button').click()
    await page.locator('.intro-player__skip').click()

    await expectLanded(page)
    await page.locator('.play-question__option', { hasText: 'Rome' }).click()
    await expect(page.locator('.play-question__option', { hasText: 'Rome' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('лимит: во время вылета таймер стоит на полном значении, после приземления идёт', async ({ page }) => {
    await mockApi(page, { mode: 'limit', seconds: LIMIT_SECONDS })
    await page.goto(`/play/${TOKEN}`)
    await waitForHydration(page)
    await page.locator('.intro-player__start-button').click()

    const time = page.locator('.play-timer__time')
    await expect(page.locator('.entrance-card--entering')).toHaveCount(1, { timeout: INTRO_TIMEOUT_MS })
    await expect(time).toHaveText('1:00')

    await expectLanded(page)
    expect(toSeconds(await time.innerText())).toBeGreaterThanOrEqual(MIN_SECONDS_AFTER_LANDING)
    await expect.poll(async () => toSeconds(await time.innerText()), { timeout: INTRO_TIMEOUT_MS }).toBeLessThan(LIMIT_SECONDS)
  })
})
