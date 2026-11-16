import { expect, test, type Page } from '@playwright/test'

const SIGNED_IN_HINT_KEY = 'nataskium-signed-in'
const SESSION = {
  accessToken: 'e2e-access-token',
  teacher: {
    id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
    email: 'qa-anna@example.test',
    displayName: 'Анна',
    hasPassword: true,
    hasGoogle: false,
  },
}

const NUMBER = 12
const TITLE = 'Столицы Европы'
const QUIZ_PATH = /\/library\/quiz\/12-/
const COPY_ID = '0b6a9c1e-7f3d-4a52-9e1b-3c5d7f9a1b2c'
const TAKE_DELAY_MS = 300
const NARROW_WIDTH = 360
const VIEWPORT_HEIGHT = 800
const CREATED_AT = '2026-11-15T10:00:00.000Z'

const GROUPS = {
  groups: [
    { slug: 'geography', names: { ru: 'География', en: 'Geography', de: 'Geografie', fr: 'Géographie' } },
    { slug: 'other', names: { ru: 'Другое', en: 'Other', de: 'Sonstiges', fr: 'Autre' } },
  ],
}

const SUMMARY = { number: NUMBER, title: TITLE, groupSlug: 'geography', questionCount: 2, graded: true, createdAt: CREATED_AT }

// Без isCorrect и selectCount: публичная карточка не отдаёт правильные ответы
const QUIZ = {
  quiz: {
    ...SUMMARY,
    questions: [
      { text: 'Столица Франции?', imageUrl: null, options: [{ text: 'Париж', imageUrl: null }, { text: 'Лион', imageUrl: null }] },
      { text: 'ОченьДлинноеСловоБезПробеловОченьДлинноеСловоБезПробеловОченьДлинное', imageUrl: null, options: [{ text: 'Да', imageUrl: null }] },
    ],
  },
}

type MockOptions = { quizStatus?: number }

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
}

// API подменён: проверяется поведение сайта, а не сервер. Все чтения библиотеки — одним обработчиком по адресу
async function mockLibrary(page: Page, { quizStatus = 200 }: MockOptions = {}) {
  await page.route((url) => url.pathname.startsWith('/api/library'), async (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname === '/api/library/groups') return route.fulfill({ json: GROUPS })
    if (pathname === '/api/library') return route.fulfill({ json: { quizzes: [SUMMARY], page: 1, hasNext: false } })
    if (quizStatus !== 200) return route.fulfill({ status: quizStatus, json: { error: 'Not found' } })
    return route.fulfill({ json: QUIZ })
  })
}

async function signInOnReload(page: Page) {
  await page.addInitScript((key) => {
    if (window.top === window) localStorage.setItem(key, '1')
  }, SIGNED_IN_HINT_KEY)
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ json: SESSION }))
}

// POST /take считает вызовы; ответ по умолчанию — успех с небольшой задержкой, чтобы второй клик успел прийти
async function mockTake(page: Page, respond: (count: number) => { status: number; json: unknown }) {
  const calls = { count: 0, authorization: [] as (string | undefined)[] }
  await page.route(`**/api/library/${NUMBER}/take`, async (route) => {
    calls.count += 1
    calls.authorization.push(route.request().headers()['authorization'])
    await new Promise((resolve) => setTimeout(resolve, TAKE_DELAY_MS))
    return route.fulfill(respond(calls.count))
  })
  return calls
}

async function openQuiz(page: Page, path = `/library/quiz/${NUMBER}-stolitsy`) {
  await page.goto(path)
  await waitForHydration(page)
  await expect(page.locator('h1')).toHaveText(TITLE)
}

function takeButton(page: Page) {
  return page.locator('.library-quiz__actions button.app-button')
}

test.describe('библиотека: страницы', () => {
  test('список группы: клик по плитке открывает карточку без правильных ответов', async ({ page }) => {
    await mockLibrary(page)

    await page.goto('/library/geography')
    await waitForHydration(page)
    await page.getByRole('link', { name: TITLE }).click()

    await expect(page).toHaveURL(QUIZ_PATH)
    await expect(page.locator('h1')).toHaveText(TITLE)
    await expect(page.locator('.library-quiz__question')).toHaveCount(2)
    await expect(takeButton(page)).toBeVisible()
    await expect(takeButton(page)).toBeEnabled()
    // В карточке нет ни переключателей, ни пометок «правильно»
    await expect(page.locator('.library-quiz__card input, .library-quiz__card [aria-checked]')).toHaveCount(0)
    expect(await page.locator('.library-quiz__card').innerText()).not.toMatch(/правильн/i)
  })

  test('карточка запрашивается без токена и без тела', async ({ page }) => {
    await mockLibrary(page)
    const requests: { method: string; authorization: string | undefined }[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === `/api/library/${NUMBER}`) {
        requests.push({ method: request.method(), authorization: request.headers()['authorization'] })
      }
    })

    await openQuiz(page)

    expect(requests.length).toBeGreaterThan(0)
    for (const request of requests) expect(request).toEqual({ method: 'GET', authorization: undefined })
  })

  test('404 от API показывает страницу 404', async ({ page }) => {
    await mockLibrary(page, { quizStatus: 404 })

    await page.goto(`/library/quiz/${NUMBER}-stolitsy`)
    await waitForHydration(page)

    await expect(page.locator('.error-page__code')).toHaveText('404')
    await expect(page.locator('h1')).toHaveText('Такой страницы нет')
    await expect(page.locator('.library-quiz__card')).toHaveCount(0)
  })

  test(`нет горизонтальной прокрутки на ${NARROW_WIDTH} px, в том числе с окном входа`, async ({ page }) => {
    await mockLibrary(page)
    await page.setViewportSize({ width: NARROW_WIDTH, height: VIEWPORT_HEIGHT })
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

    await openQuiz(page)
    expect(await overflow()).toBeLessThanOrEqual(0)

    await takeButton(page).click()
    await expect(page.locator('.app-dialog')).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
  })
})

test.describe('библиотека: «Взять себе»', () => {
  test('гость: окно входа, «Войти» ведёт на /auth/login?next= на эту же карточку', async ({ page }) => {
    await mockLibrary(page)
    let takeCalls = 0
    await page.route('**/api/library/*/take', (route) => {
      takeCalls += 1
      return route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
    })
    await openQuiz(page)
    const cardUrl = new URL(page.url())

    await takeButton(page).click()

    const dialog = page.locator('.app-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading')).toHaveText('Войдите, чтобы взять задание')
    expect(takeCalls).toBe(0)
    // Регистрация без next
    await expect(dialog.getByRole('link', { name: 'Зарегистрироваться' })).toHaveAttribute('href', '/auth/register')

    await dialog.getByRole('link', { name: 'Войти' }).click()

    await expect(page).toHaveURL(/\/auth\/login\?next=/)
    const next = new URL(page.url()).searchParams.get('next')
    expect(next).toBe(cardUrl.pathname)
  })

  test('окно закрывается кнопкой «Закрыть» и клавишей Esc, прокрутка страницы блокируется только пока оно открыто', async ({ page }) => {
    await mockLibrary(page)
    await openQuiz(page)
    const isLocked = () => page.evaluate(() => document.documentElement.classList.contains('is-scroll-locked'))

    await takeButton(page).click()
    await expect(page.locator('.app-dialog')).toBeVisible()
    expect(await isLocked()).toBe(true)

    await page.getByRole('button', { name: 'Закрыть' }).click()
    await expect(page.locator('.app-dialog')).toBeHidden()
    expect(await isLocked()).toBe(false)

    await takeButton(page).click()
    await expect(page.locator('.app-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.app-dialog')).toBeHidden()
    expect(await isLocked()).toBe(false)
  })

  test('вошедший: два быстрых клика дают один POST с токеном и переход в редактор копии', async ({ page }) => {
    await signInOnReload(page)
    await mockLibrary(page)
    await page.route('**/api/quizzes/**', (route) => route.fulfill({ status: 404, json: { error: 'Not found' } }))
    const calls = await mockTake(page, () => ({ status: 201, json: { quizId: COPY_ID } }))
    await openQuiz(page)
    await expect(takeButton(page)).toBeEnabled()

    await takeButton(page).dblclick()

    await expect(page).toHaveURL(new RegExp(`/teacher/quiz/${COPY_ID}$`))
    expect(calls.count).toBe(1)
    expect(calls.authorization).toEqual([`Bearer ${SESSION.accessToken}`])
    await expect(page.locator('.library-quiz')).toHaveCount(0)
  })

  test('вошедший, 409: видно сообщение про лимит и ссылку в «Мои задания», остаёмся на карточке', async ({ page }) => {
    await signInOnReload(page)
    await mockLibrary(page)
    await mockTake(page, () => ({ status: 409, json: { error: 'Quiz limit reached' } }))
    await openQuiz(page)
    await expect(takeButton(page)).toBeEnabled()

    await takeButton(page).click()

    const alert = page.locator('.library-quiz__actions [role="alert"]')
    await expect(alert).toContainText('Достигнут лимит: не больше')
    await expect(alert).toContainText(/\d+ заданий/)
    await expect(alert.getByRole('link', { name: 'Перейти в «Мои задания»' })).toHaveAttribute('href', '/teacher')
    await expect(page).toHaveURL(QUIZ_PATH)
    await expect(takeButton(page)).toBeEnabled()
  })

  test('вошедший, 503: видно сообщение про хранилище, повторное нажатие работает', async ({ page }) => {
    await signInOnReload(page)
    await mockLibrary(page)
    await page.route('**/api/quizzes/**', (route) => route.fulfill({ status: 404, json: { error: 'Not found' } }))
    const calls = await mockTake(page, (count) =>
      count === 1 ? { status: 503, json: { error: 'Storage unavailable' } } : { status: 201, json: { quizId: COPY_ID } },
    )
    await openQuiz(page)
    await expect(takeButton(page)).toBeEnabled()

    await takeButton(page).click()

    const alert = page.locator('.library-quiz__actions [role="alert"]')
    await expect(alert).toContainText('Не получилось скопировать картинки')
    await expect(page).toHaveURL(QUIZ_PATH)

    await takeButton(page).click()

    await expect(page).toHaveURL(new RegExp(`/teacher/quiz/${COPY_ID}$`))
    expect(calls.count).toBe(2)
  })
})
