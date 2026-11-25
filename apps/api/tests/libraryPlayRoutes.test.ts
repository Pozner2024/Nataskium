import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { LIBRARY_PLAY_ROUTES_BASE_PATH, type LibraryPlayRouterDeps, makeLibraryPlayRouter } from '../src/features/library'
import { AppError } from '../src/shared/errors'
import { createRateLimiter, makeErrorHandler } from '../src/shared/middleware'

const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'
const NUMBER = 12
const NOT_FOUND = 404
const BAD_REQUEST = 400
const TOO_MANY_REQUESTS = 429
const WINDOW_MS = 60_000
const MAX_TRACKED_KEYS = 100
const GENEROUS_LIMIT = 1000
const RESULT = { percent: 100, grade: '5', correctCount: 1, partialCount: 0, totalCount: 1 }

// Валидные тела: невалидное тело дало бы 400 раньше разбора номера
const ROUTES = [
  { method: 'GET', suffix: '', body: undefined },
  { method: 'POST', suffix: '/check', body: { version: 'v1', questionIndex: 0, selected: [0] } },
  { method: 'POST', suffix: '/finish', body: { version: 'v1', answers: [[0]] } },
  { method: 'POST', suffix: '/matching/finish', body: { version: 'v1', answers: ['кот'] } },
  { method: 'POST', suffix: '/true-false/check', body: { version: 'v1', index: 0, answer: true } },
  { method: 'POST', suffix: '/true-false/finish', body: { version: 'v1', answers: [true] } },
] as const

const INVALID_NUMBERS = ['abc', '0', '-1', '2147483648', '12.5']

const limiter = (max = GENEROUS_LIMIT) => createRateLimiter({ max, windowMs: WINDOW_MS, maxTrackedKeys: MAX_TRACKED_KEYS })

function setup(overrides: Partial<LibraryPlayRouterDeps> = {}) {
  const fakes = {
    findShareToken: vi.fn(async (_number: number) => SHARE_TOKEN),
    getPlayActivity: vi.fn(async (_token: string) => ({
      type: 'truefalse' as const,
      trueFalse: { title: 'T', showAnswers: true, version: 'v1', timer: { mode: 'none' as const }, introTheme: 'nataskium-day' as const, statements: ['a'] },
    })),
    checkAnswer: vi.fn(async () => ({ correct: [0] })),
    finishQuiz: vi.fn(async () => ({ result: RESULT })),
    finishMatching: vi.fn(async () => ({ result: RESULT })),
    checkTrueFalse: vi.fn(async () => ({ correct: true })),
    finishTrueFalse: vi.fn(async () => ({ result: RESULT })),
  }
  const deps: LibraryPlayRouterDeps = {
    ...fakes,
    clientIp: () => '127.0.0.1',
    limiters: { get: limiter(), check: limiter(), finish: limiter() },
    ...overrides,
  }
  const app = new Hono()
  app.onError(makeErrorHandler(false))
  app.route(LIBRARY_PLAY_ROUTES_BASE_PATH, makeLibraryPlayRouter(deps))
  const call = (method: string, path: string, body?: unknown) =>
    app.request(`${LIBRARY_PLAY_ROUTES_BASE_PATH}${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const playCalls = () =>
    [fakes.getPlayActivity, fakes.checkAnswer, fakes.finishQuiz, fakes.finishMatching, fakes.checkTrueFalse, fakes.finishTrueFalse].reduce(
      (sum, fn) => sum + fn.mock.calls.length,
      0,
    )
  return { deps: fakes, call, playCalls }
}

describe('/api/library/play: номер', () => {
  for (const route of ROUTES) {
    it(`${route.method} <номер>${route.suffix}: невалидный номер — 404 «Quiz not found» без поиска задания`, async () => {
      const { deps, call, playCalls } = setup()

      for (const raw of INVALID_NUMBERS) {
        const response = await call(route.method, `/${raw}${route.suffix}`, route.body)
        expect(response.status).toBe(NOT_FOUND)
        expect(await response.json()).toEqual({ error: 'Quiz not found' })
      }
      expect(deps.findShareToken).not.toHaveBeenCalled()
      expect(playCalls()).toBe(0)
    })
  }

  it('use-case игры получает shareToken от резолвера, а не номер из адреса', async () => {
    const { deps, call } = setup()

    for (const route of ROUTES) expect((await call(route.method, `/${NUMBER}${route.suffix}`, route.body)).status).toBe(200)

    expect(deps.findShareToken.mock.calls.map(([number]) => number)).toEqual(ROUTES.map(() => NUMBER))
    expect(deps.getPlayActivity).toHaveBeenCalledWith(SHARE_TOKEN)
    expect(deps.checkAnswer).toHaveBeenCalledWith(SHARE_TOKEN, ROUTES[1].body)
    expect(deps.finishQuiz).toHaveBeenCalledWith(SHARE_TOKEN, ROUTES[2].body)
    expect(deps.finishMatching).toHaveBeenCalledWith(SHARE_TOKEN, ROUTES[3].body)
    expect(deps.checkTrueFalse).toHaveBeenCalledWith(SHARE_TOKEN, ROUTES[4].body)
    expect(deps.finishTrueFalse).toHaveBeenCalledWith(SHARE_TOKEN, ROUTES[5].body)
  })

  it('ответ игры отдаётся как есть, shareToken в него не добавляется', async () => {
    const { call } = setup()

    const text = await (await call('GET', `/${NUMBER}`)).text()

    expect(text).not.toContain(SHARE_TOKEN)
    expect(JSON.parse(text)).toMatchObject({ type: 'truefalse' })
  })

  it('резолвер не нашёл опубликованное задание — его 404, игра не вызывается', async () => {
    const findShareToken = vi.fn(async () => {
      throw new AppError(NOT_FOUND, 'Quiz not found')
    })
    const { call, playCalls } = setup({ findShareToken })

    for (const route of ROUTES) expect((await call(route.method, `/${NUMBER}${route.suffix}`, route.body)).status).toBe(NOT_FOUND)
    expect(playCalls()).toBe(0)
  })

  it('невалидное тело — 400 раньше номера и резолвера, как у /api/play', async () => {
    const { deps, call } = setup()

    for (const route of ROUTES.filter((item) => item.method === 'POST')) {
      expect((await call('POST', `/abc${route.suffix}`, { version: '' })).status).toBe(BAD_REQUEST)
    }
    expect(deps.findShareToken).not.toHaveBeenCalled()
  })
})

describe('/api/library/play: лимиты', () => {
  it('GET под лимитером get, check — под check, finish — под finish', async () => {
    const { call } = setup({ limiters: { get: limiter(1), check: limiter(1), finish: limiter(1) } })

    expect((await call('GET', `/${NUMBER}`)).status).toBe(200)
    expect((await call('GET', `/${NUMBER}`)).status).toBe(TOO_MANY_REQUESTS)
    expect((await call('POST', `/${NUMBER}/check`, ROUTES[1].body)).status).toBe(200)
    expect((await call('POST', `/${NUMBER}/true-false/check`, ROUTES[4].body)).status).toBe(TOO_MANY_REQUESTS)
    expect((await call('POST', `/${NUMBER}/finish`, ROUTES[2].body)).status).toBe(200)
    expect((await call('POST', `/${NUMBER}/matching/finish`, ROUTES[3].body)).status).toBe(TOO_MANY_REQUESTS)
    expect((await call('POST', `/${NUMBER}/true-false/finish`, ROUTES[5].body)).status).toBe(TOO_MANY_REQUESTS)
  })
})
