import { expect, test, type Page } from '@playwright/test'

const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA'
const VERSION = 'v1'

// Перед загруженным заданием — стартовый экран интро: игра появляется после «Начать».
// «Начать» разворачивает проигрыватель на весь экран: ждём, пока раскладка встанет, иначе координаты устареют
async function startIntro(page: Page) {
  await page.locator('.intro-player__start-button').click()
  await page.waitForFunction(() => !document.fullscreenEnabled || document.fullscreenElement !== null)
}

function options(...texts: string[]) {
  return texts.map((text) => ({ text, imageUrl: null }))
}

function quizBody(showAnswers: boolean) {
  return {
    type: 'quiz',
    quiz: {
      title: 'Capitals',
      showAnswers,
      timer: { mode: 'none' },
      version: VERSION,
      questions: [
        { text: 'Capital of France?', imageUrl: null, options: options('Paris', 'Rome', 'Berlin'), selectCount: 1 },
        { text: 'Danube cities?', imageUrl: null, options: options('Vienna', 'Prague', 'Budapest', 'Madrid'), selectCount: 2 },
      ],
    },
  }
}

const IMAGE_ORIGIN = 'https://images.example'
const IMAGE_QUESTION = `${IMAGE_ORIGIN}/quiz-images/question.webp`
const IMAGE_CAT = `${IMAGE_ORIGIN}/quiz-images/cat.webp`
const IMAGE_TIGER = `${IMAGE_ORIGIN}/quiz-images/tiger.webp`
const IMAGE_BROKEN = `${IMAGE_ORIGIN}/quiz-images/broken.webp`
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

// Без текста — «Cat» (0) и битая картинка (2); «Tiger» (1) — картинка и текст
function imageQuizBody() {
  return {
    type: 'quiz',
    quiz: {
      title: 'Animals',
      showAnswers: false,
      timer: { mode: 'none' },
      version: VERSION,
      questions: [
        {
          text: 'Where is the cat?',
          imageUrl: IMAGE_QUESTION,
          options: [
            { text: '', imageUrl: IMAGE_CAT },
            { text: 'Tiger', imageUrl: IMAGE_TIGER },
            { text: '', imageUrl: IMAGE_BROKEN },
          ],
          selectCount: 1,
        },
      ],
    },
  }
}

// Правильные: вопрос 0 — «Paris» (0); вопрос 1 — «Vienna» (0) и «Budapest» (2)
const CORRECT = [[0], [0, 2]]

async function mockApi(page: Page, showAnswers: boolean) {
  const calls = { check: 0, finish: 0 }
  await page.route('**/api/play/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/check')) {
      calls.check += 1
      const { questionIndex } = request.postDataJSON() as { questionIndex: number }
      return route.fulfill({ json: { correct: CORRECT[questionIndex] } })
    }
    if (url.pathname.endsWith('/finish')) {
      calls.finish += 1
      return route.fulfill({
        json: { result: { percent: 100, grade: '5', correctCount: 2, partialCount: 0, totalCount: 2 } },
      })
    }
    return route.fulfill({ json: quizBody(showAnswers) })
  })
  return calls
}

async function pick(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click()
}

test.describe('игра ученика', () => {
  test('en-US: английский интерфейс, прохождение с подсветкой, процент и оценка', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    const calls = await mockApi(page, true)

    await page.goto(`/play/${TOKEN}`)
    await expect(page).toHaveURL(new RegExp(`/en/play/${TOKEN}$`))
    await startIntro(page)
    await expect(page.getByRole('heading', { name: 'Capital of France?' })).toBeVisible()
    await expect(page.getByText('Select 1 answer')).toBeVisible()

    const submit = page.getByRole('button', { name: 'Answer' })
    await expect(submit).toBeDisabled()
    await pick(page, 'Paris')
    // Один ответ: клик по другому варианту заменяет выбор, блокировки нет
    await expect(page.getByRole('button', { name: 'Rome' })).toBeEnabled()
    await pick(page, 'Rome')
    await expect(page.getByRole('button', { name: 'Rome' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Paris', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await pick(page, 'Paris')
    await submit.click()
    await expect(page.locator('.play-question__option--correct')).toHaveCount(1)
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    await expect(page.getByText('Select 2 answers')).toBeVisible()
    await pick(page, 'Vienna')
    await pick(page, 'Prague')
    await submit.click()
    await expect(page.locator('.play-question__option--correct')).toHaveCount(1)
    await expect(page.locator('.play-question__option--wrong')).toHaveCount(1)
    await expect(page.locator('.play-question__option--missed')).toHaveCount(1)
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    await expect(page.getByText('100%')).toBeVisible()
    await expect(page.getByText('Grade: 5')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible()
    expect(calls).toEqual({ check: 2, finish: 1 })
    await context.close()
  })

  test('стрелки: назад показывает прошлый вопрос с отметками без нового check, вперёд — до текущего', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    const calls = await mockApi(page, true)

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    const prev = page.getByRole('button', { name: 'Previous question' })
    const forward = page.getByRole('button', { name: 'Next question' })
    await expect(prev).toBeDisabled()
    await expect(forward).toBeDisabled()

    await pick(page, 'Rome')
    await page.getByRole('button', { name: 'Answer' }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Danube cities?' })).toBeVisible()
    await expect(prev).toBeEnabled()

    await prev.click()
    await expect(page.getByRole('heading', { name: 'Capital of France?' })).toBeVisible()
    await expect(page.locator('.play-question__progress')).toHaveText('1 / 2')
    await expect(page.locator('.play-question__option--wrong')).toHaveCount(1)
    await expect(page.locator('.play-question__option--missed')).toHaveCount(1)
    await expect(page.locator('.play-question__option').first()).toBeDisabled()
    await expect(prev).toBeDisabled()

    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('heading', { name: 'Danube cities?' })).toBeVisible()
    await expect(forward).toBeDisabled()
    expect(calls).toEqual({ check: 1, finish: 0 })
    await context.close()
  })

  test('ru-RU: русский интерфейс без префикса, плюрализация', async ({ page }) => {
    await mockApi(page, false)
    await page.goto(`/play/${TOKEN}`)
    await expect(page).toHaveURL(new RegExp(`/play/${TOKEN}$`))
    await startIntro(page)
    await expect(page.getByText('Выберите 1 ответ', { exact: true })).toBeVisible()
  })

  test('ответы скрыты: после «Ответить» нет подсветки, check не вызывается', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    const calls = await mockApi(page, false)

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    await pick(page, 'Paris')
    await page.getByRole('button', { name: 'Answer' }).click()

    await expect(page.getByRole('heading', { name: 'Danube cities?' })).toBeVisible()
    await expect(page.locator('.play-question__mark')).toHaveCount(0)
    expect(calls.check).toBe(0)
    await context.close()
  })

  test('404: сообщение, что задание не найдено', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    await page.route('**/api/play/**', (route) => route.fulfill({ status: 404, json: { error: 'not_found' } }))
    await page.goto(`/play/${TOKEN}`)
    await expect(page.getByText('Activity not found or deleted')).toBeVisible()
    await context.close()
  })
  test('пропущенный правильный: пустая отметка и скрытый текст для скринридера', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    await mockApi(page, true)

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    await pick(page, 'Paris')
    await page.getByRole('button', { name: 'Answer' }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await pick(page, 'Vienna')
    await pick(page, 'Prague')
    await page.getByRole('button', { name: 'Answer' }).click()

    const missed = page.locator('.play-question__option--missed')
    await expect(missed).toContainText('correct option, not selected')
    await expect(missed.locator('.play-question__mark')).toHaveText('')
    await context.close()
  })

  test('итог без оценки: «Correct: a of n» и «Partially correct: b»', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    await page.route('**/api/play/**', (route) => {
      const { pathname } = new URL(route.request().url())
      if (pathname.endsWith('/check')) return route.fulfill({ json: { correct: [0] } })
      if (pathname.endsWith('/finish')) {
        return route.fulfill({
          json: { result: { percent: 75, grade: null, correctCount: 1, partialCount: 1, totalCount: 2 } },
        })
      }
      return route.fulfill({ json: quizBody(true) })
    })

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    for (const names of [['Paris'], ['Vienna', 'Prague']]) {
      for (const name of names) await pick(page, name)
      await page.getByRole('button', { name: 'Answer' }).click()
      await page.getByRole('button', { name: 'Next', exact: true }).click()
    }

    await expect(page.getByText('75%')).toBeVisible()
    await expect(page.getByText('Correct: 1 of 2')).toBeVisible()
    await expect(page.getByText('Partially correct: 1')).toBeVisible()
    await expect(page.getByText(/^Grade:/)).toHaveCount(0)
    await context.close()
  })

  test('409 на check: сообщение и «Start over» загружает задание заново', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    let loads = 0
    await page.route('**/api/play/**', (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/check')) {
        return route.fulfill({ status: 409, json: { error: 'quiz_changed' } })
      }
      loads += 1
      return route.fulfill({ json: quizBody(true) })
    })

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    await pick(page, 'Paris')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByRole('alert')).toHaveText('The activity has changed, please start over')

    await page.getByRole('button', { name: 'Start over' }).click()
    await expect(page.getByRole('heading', { name: 'Capital of France?' })).toBeVisible()
    expect(loads).toBe(2)
    await context.close()
  })

  test('500 на check: сообщение и «Try again» повторяет запрос', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    let checks = 0
    await page.route('**/api/play/**', (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/check')) {
        checks += 1
        if (checks === 1) return route.fulfill({ status: 500, json: { error: 'x' } })
        return route.fulfill({ json: { correct: [0] } })
      }
      return route.fulfill({ json: quizBody(true) })
    })

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    await pick(page, 'Paris')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByRole('alert')).toHaveText('Something went wrong, please try again')

    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.locator('.play-question__option--correct')).toHaveCount(1)
    expect(checks).toBe(2)
    await context.close()
  })

  test('404: сообщение остаётся в role="alert"', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    await page.route('**/api/play/**', (route) => route.fulfill({ status: 404, json: { error: 'not_found' } }))
    await page.goto(`/play/${TOKEN}`)
    await expect(page.getByRole('alert')).toHaveText('Activity not found or deleted')
    await context.close()
  })

  test('картинки: вопрос и варианты с картинками, битая картинка — заглушка, вариант выбирается', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    await page.route(`${IMAGE_ORIGIN}/**`, (route) => {
      if (route.request().url() === IMAGE_BROKEN) return route.fulfill({ status: 404 })
      return route.fulfill({ contentType: 'image/png', body: PIXEL_PNG })
    })
    let answers: unknown = null
    await page.route('**/api/play/**', (route) => {
      const request = route.request()
      if (new URL(request.url()).pathname.endsWith('/finish')) {
        answers = (request.postDataJSON() as { answers: unknown }).answers
        return route.fulfill({
          json: { result: { percent: 100, grade: null, correctCount: 1, partialCount: 0, totalCount: 1 } },
        })
      }
      return route.fulfill({ json: imageQuizBody() })
    })

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    await expect(page.getByRole('heading', { name: 'Where is the cat?' })).toBeVisible()
    await expect(page.locator('.play-question__image-img')).toHaveJSProperty('naturalWidth', 1)

    const images = page.getByRole('button', { name: /^Image \d$/ })
    await expect(images).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Tiger' }).locator('img')).toHaveCount(1)
    await expect(page.locator('.play-question__option-fallback')).toHaveCount(1)

    const broken = page.locator('.play-question__option', { has: page.locator('.play-question__option-fallback') })
    await expect(broken).toBeEnabled()
    const cat = page.locator('.play-question__option', { has: page.locator(`img[src="${IMAGE_CAT}"]`) })
    await cat.click()
    await expect(cat).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Answer' }).click()

    await expect(page.getByText('100%')).toBeVisible()
    expect(answers).toEqual([[0]])
    await context.close()
  })
})

test.describe('игра ученика: таймер', () => {
  test('лимит 60 с: по истечении уходит finish, неотвеченное и невыбранное — пустые массивы, на итоге примечание', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    await page.clock.install()
    let answers: unknown = null
    await page.route('**/api/play/**', (route) => {
      const request = route.request()
      if (new URL(request.url()).pathname.endsWith('/finish')) {
        answers = (request.postDataJSON() as { answers: unknown }).answers
        return route.fulfill({
          json: { result: { percent: 0, grade: null, correctCount: 0, partialCount: 1, totalCount: 2 } },
        })
      }
      return route.fulfill({ json: { type: 'quiz', quiz: { ...quizBody(false).quiz, timer: { mode: 'limit', seconds: 60 } } } })
    })

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    await expect(page.getByRole('heading', { name: 'Capital of France?' })).toBeVisible()
    await expect(page.getByRole('timer')).toContainText('1:00')

    await pick(page, 'Paris')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByRole('heading', { name: 'Danube cities?' })).toBeVisible()
    await pick(page, 'Vienna')

    await page.clock.runFor(46_000)
    await expect(page.getByText('Time is running out', { exact: true })).toBeVisible()
    expect(answers).toBeNull()

    await page.clock.runFor(14_000)
    await expect(page.getByText('Time is up: unanswered questions count as wrong')).toBeVisible()
    expect(answers).toEqual([[0], []])
    await context.close()
  })
})
