import { expect, test, type Page } from '@playwright/test'

// Интро и вылет вопроса темы по умолчанию — анимация на несколько секунд; эти тесты проверяют игру, поэтому анимации выключены
test.use({ contextOptions: { reducedMotion: 'reduce' } })

const TOKEN = 'BBBBBBBBBBBBBBBBBBBBBB'
const VERSION = 'v1'

// Определения в порядке учителя; слова — в порядке сервера (перемешаны). Верно: Meows — Cat, Barks — Dog
const DEFINITIONS = ['Meows', 'Barks']
const TERMS = ['Dog', 'Cat']
const EXPECTED_ANSWERS = ['Cat', 'Dog']

// Перед загруженным заданием — стартовый экран интро: игра появляется после «Начать»
async function startIntro(page: Page) {
  await page.locator('.intro-player__start-button').click()
}

function matchingBody() {
  return {
    type: 'matching',
    matching: {
      title: 'Animals',
      showAnswers: false,
      version: VERSION,
      introTheme: 'nataskium-night',
      timer: { mode: 'none' },
      definitions: DEFINITIONS,
      terms: TERMS,
    },
  }
}

// Проверяем, что сайт отправляет слова по порядку определений, и отдаём итог
async function mockApi(page: Page) {
  const calls = { get: 0, finish: 0 }
  await page.route('**/api/play/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/matching/finish')) {
      calls.finish += 1
      const { answers } = request.postDataJSON() as { answers: (string | null)[] }
      expect(answers).toEqual(EXPECTED_ANSWERS)
      return route.fulfill({
        json: { result: { percent: 100, grade: '5', correctCount: 2, partialCount: 0, totalCount: 2 } },
      })
    }
    calls.get += 1
    return route.fulfill({ json: matchingBody() })
  })
  return calls
}

function chip(page: Page, text: string) {
  return page.locator('.matching-board__pool .term-chip').filter({ hasText: text })
}

function dropOf(page: Page, index: number) {
  return page.locator('.definition-card').nth(index).locator('.definition-card__drop')
}

test.describe('игра сопоставления', () => {
  test('тап: слово выбирается, потом ставится к определению; «Проверить» ведёт к итогу', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    const calls = await mockApi(page)

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    await expect(page.getByRole('heading', { name: 'Match the words with their definitions' })).toBeVisible()
    await expect(page.locator('.definition-card__text').first()).toContainText('Meows')

    await chip(page, 'Cat').click()
    await expect(chip(page, 'Cat')).toHaveAttribute('aria-pressed', 'true')
    await dropOf(page, 0).click()
    await expect(page.locator('.definition-card').nth(0)).toHaveClass(/definition-card--filled/)

    await chip(page, 'Dog').click()
    await dropOf(page, 1).click()
    await expect(page.locator('.matching-board__progress')).toHaveText('2 / 2')

    await page.getByRole('button', { name: 'Check', exact: true }).click()
    await expect(page.getByText('100%')).toBeVisible()
    await expect(page.getByText('Grade: 5')).toBeVisible()
    expect(calls).toEqual({ get: 1, finish: 1 })
    await context.close()
  })

  test('заголовок «Слова» только для скринридера, слово в лотке и пустая клетка одной высоты', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    await mockApi(page)

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    await expect(page.getByRole('heading', { name: 'Match the words with their definitions' })).toBeVisible()

    // Скрыт визуально (1×1 с обрезкой), но остаётся подписью списка слов
    const title = page.locator('.matching-board__tray-title')
    await expect(title).toHaveText('Words')
    const titleBox = await title.boundingBox()
    expect(titleBox?.width).toBeLessThanOrEqual(1)
    expect(titleBox?.height).toBeLessThanOrEqual(1)
    await expect(page.getByRole('list', { name: 'Words' })).toBeVisible()

    const chipBox = await chip(page, 'Cat').boundingBox()
    const dropBox = await dropOf(page, 0).boundingBox()
    expect(chipBox?.height).toBeCloseTo(dropBox?.height ?? 0, 0)
    await context.close()
  })

  test('перетаскивание мышью: слово тянется на определение, итог тот же', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    const calls = await mockApi(page)

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    await expect(page.getByRole('heading', { name: 'Match the words with their definitions' })).toBeVisible()

    // Ведём «Cat» к первому определению, потом «Dog» ко второму: шаги дают pointermove сверх порога
    for (const [word, target] of [['Cat', 0], ['Dog', 1]] as const) {
      const source = await chip(page, word).boundingBox()
      const destination = await dropOf(page, target).boundingBox()
      if (source === null || destination === null) throw new Error(`no geometry for ${word}`)
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
      await page.mouse.down()
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 + 20, { steps: 4 })
      await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 12 })
      await page.mouse.up()
    }
    await expect(page.locator('.matching-board__progress')).toHaveText('2 / 2')

    await page.getByRole('button', { name: 'Check', exact: true }).click()
    await expect(page.getByText('100%')).toBeVisible()
    expect(calls).toEqual({ get: 1, finish: 1 })
    await context.close()
  })
})
