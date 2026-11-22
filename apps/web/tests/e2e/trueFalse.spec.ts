import { expect, test, type Page } from '@playwright/test'

// Интро и вылет вопроса темы по умолчанию — анимация на несколько секунд; эти тесты проверяют игру, поэтому анимации выключены
test.use({ contextOptions: { reducedMotion: 'reduce' } })

const TOKEN = 'CCCCCCCCCCCCCCCCCCCCCC'
const VERSION = 'v1'

// Верные ответы: Да, Нет, Да
const STATEMENTS = ['Земля круглая', 'Солнце холодное', 'Вода мокрая'] as const
const [FIRST, SECOND, THIRD] = STATEMENTS
const CORRECT_ANSWERS = [true, false, true]

// Перед загруженным заданием — стартовый экран интро: игра появляется после «Начать»
async function startIntro(page: Page) {
  await page.locator('.intro-player__start-button').click()
}

function activityBody(showAnswers: boolean) {
  return {
    type: 'truefalse',
    trueFalse: { title: 'Факты', showAnswers, version: VERSION, introTheme: 'nataskium-night', timer: { mode: 'none' }, statements: STATEMENTS },
  }
}

// Подмена API: тела запросов записываем, сверяем в теле теста (упавший expect в обработчике оставил бы запрос без ответа).
// Всё, кроме GET задания, check и finish, обрывается и попадает в unexpected
async function mockApi(page: Page, showAnswers: boolean) {
  const calls = {
    get: 0,
    check: [] as { index: number; answer: boolean }[],
    finish: [] as (boolean | null)[][],
    unexpected: [] as string[],
  }
  await page.route('**/api/play/**', async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    if (request.method() === 'POST' && pathname.endsWith(`/${TOKEN}/true-false/check`)) {
      const { index, answer } = request.postDataJSON() as { index: number; answer: boolean }
      calls.check.push({ index, answer })
      return route.fulfill({ json: { correct: answer === CORRECT_ANSWERS[index] } })
    }
    if (request.method() === 'POST' && pathname.endsWith(`/${TOKEN}/true-false/finish`)) {
      const { answers } = request.postDataJSON() as { answers: (boolean | null)[] }
      calls.finish.push(answers)
      const correctCount = answers.filter((answer, index) => answer === CORRECT_ANSWERS[index]).length
      const percent = Math.round((correctCount / STATEMENTS.length) * 100)
      return route.fulfill({
        json: {
          result: { percent, grade: '5', correctCount, partialCount: 0, totalCount: STATEMENTS.length },
          ...(showAnswers && { review: CORRECT_ANSWERS.map((answer, index) => ({ correct: answers[index] === answer, answer })) }),
        },
      })
    }
    if (request.method() === 'GET' && pathname.endsWith(`/api/play/${TOKEN}`)) {
      calls.get += 1
      return route.fulfill({ json: activityBody(showAnswers) })
    }
    calls.unexpected.push(`${request.method()} ${pathname}`)
    return route.abort()
  })
  return calls
}

test.describe('игра да/нет', () => {
  test('без показа ответов: Да, Нет, Да → один finish, виден итог', async ({ page }) => {
    const calls = await mockApi(page, false)

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    await expect(page.getByRole('heading', { name: FIRST })).toBeVisible()

    await page.getByRole('button', { name: 'Да', exact: true }).click()
    await expect(page.getByRole('heading', { name: SECOND })).toBeVisible()
    await page.getByRole('button', { name: 'Нет', exact: true }).click()
    await expect(page.getByRole('heading', { name: THIRD })).toBeVisible()
    await page.getByRole('button', { name: 'Да', exact: true }).click()

    await expect(page.getByText('100%')).toBeVisible()
    await expect(page.getByText('Оценка: 5')).toBeVisible()
    await expect(page.getByText('Правильные ответы для этого задания не показываются.')).toBeVisible()
    expect(calls).toEqual({ get: 1, check: [], finish: [[true, false, true]], unexpected: [] })
  })

  test('с показом ответов: подсветка со значком, автопереход, стрелка ← для просмотра, разбор', async ({ page }) => {
    // Первый ответ неверный: в разборе виден правильный
    const calls = await mockApi(page, true)
    const yes = page.getByRole('button', { name: 'Да', exact: true })
    const no = page.getByRole('button', { name: 'Нет', exact: true })
    const prev = page.getByRole('button', { name: 'Предыдущее утверждение' })

    await page.goto(`/play/${TOKEN}`)
    await startIntro(page)
    await expect(page.getByRole('heading', { name: FIRST })).toBeVisible()
    await expect(prev).toBeDisabled()

    await no.click()
    await expect(page.getByRole('heading', { name: SECOND })).toBeVisible()
    await expect(page.locator('.answer-buttons__badge')).toHaveCount(0)

    await prev.click()
    await expect(page.getByRole('heading', { name: FIRST })).toBeVisible()
    await expect(no.locator('.answer-buttons__badge')).toHaveText('✗')
    await expect(yes).toBeDisabled()
    await expect(no).toBeDisabled()
    await expect(prev).toBeDisabled()
    await page.getByRole('button', { name: 'Следующее утверждение' }).click()
    await expect(page.getByRole('heading', { name: SECOND })).toBeVisible()
    await expect(yes).toBeEnabled()

    await no.click()
    await expect(page.getByRole('heading', { name: THIRD })).toBeVisible()

    await yes.click()

    await expect(page.getByText('67%')).toBeVisible()
    await expect(page.getByText('Ваши ответы')).toBeVisible()
    const firstRow = page.locator('.review-row').first()
    await expect(firstRow).toContainText(FIRST)
    await expect(firstRow).toContainText('Неверно')
    await expect(firstRow).toContainText('Правильный ответ: Да')
    expect(calls).toEqual({
      get: 1,
      check: [{ index: 0, answer: false }, { index: 1, answer: false }, { index: 2, answer: true }],
      finish: [[false, false, true]],
      unexpected: [],
    })
  })
})
