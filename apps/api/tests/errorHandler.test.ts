import { inspect } from 'node:util'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'
import { AppError } from '../src/shared/errors'

const EMAIL = 'student@example.com'
const INTERNAL_ERROR_BODY = '{"error":"Internal Server Error"}'
const LOG_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const
// Статус вне таблицы node:http
const UNKNOWN_STATUS = 599 as ContentfulStatusCode
const SHARE_TOKEN = 'k3j9-share-token'
const SHARE_ROUTE = '/play/:shareToken'
const TEST_FILE = 'errorHandler.test.ts'
const ERROR_HANDLER_FAILED = 'Error handler failed'
// Статус без тела: c.json на нём бросает исключение, то есть падает сам обработчик
const STATUS_WITHOUT_BODY = 204 as ContentfulStatusCode

const NON_DEVELOPMENT_ENVS: [string, string | undefined][] = [
  ['не задано', undefined],
  ['пустое', ''],
  ['production', 'production'],
  ['test', 'test'],
  ['Development', 'Development'],
  ['пробел в начале', ' development'],
  ['пробел в конце', 'development '],
  ['dev', 'dev'],
]

const LOGGED_ERRORS: [string, () => Error, string][] = [
  ['обычная ошибка', () => new TypeError('boom'), 'TypeError'],
  ['email в message', () => new Error(`User ${EMAIL} not found`), 'Error'],
  ['многострочный message', () => new Error(`Query failed\n    at ${EMAIL}`), 'Error'],
  ['строка кадра в message', () => new Error(`Query failed\n    at ${EMAIL}:1:2`), 'Error'],
  ['кадр со скобками в message', () => new Error(`Query failed\n    at foo (${EMAIL}:1:2)`), 'Error'],
  ['к stack дописан Caused by', () => withAppendedStack(`Caused by: Error: inner\n    at ${EMAIL}`), 'Error'],
  ['к stack дописана строка кадра', () => withAppendedStack(`    at ${EMAIL}:1:2`), 'Error'],
  ['message изменён после чтения stack', () => withChangedMessage(), 'Error'],
  ['error.name из данных', () => Object.assign(new RangeError('boom'), { name: EMAIL }), 'RangeError'],
  ['cause с email', () => new Error('outer', { cause: new Error(EMAIL) }), 'Error'],
  ['AppError 500', () => new AppError(500, EMAIL), 'AppError'],
  ['HTTPException 503', () => new HTTPException(503, { message: EMAIL }), 'HTTPException'],
]

const RESPONSES: [string, () => unknown, number, string][] = [
  ['Error', () => new Error(EMAIL), 500, INTERNAL_ERROR_BODY],
  ['не Error', () => EMAIL, 500, INTERNAL_ERROR_BODY],
  ['AppError 400', () => new AppError(400, 'Bad input'), 400, '{"error":"Bad input"}'],
  ['AppError 500', () => new AppError(500, 'Failed'), 500, '{"error":"Failed"}'],
  ['HTTPException 401', () => new HTTPException(401, { message: EMAIL }), 401, '{"error":"Unauthorized"}'],
  ['HTTPException 503', () => new HTTPException(503, { message: EMAIL }), 503, '{"error":"Service Unavailable"}'],
  ['сбой обработчика', () => new AppError(STATUS_WITHOUT_BODY, EMAIL), 500, INTERNAL_ERROR_BODY],
]

const NON_ERRORS: [string, unknown][] = [
  ['строка', EMAIL],
  ['объект', { email: EMAIL }],
  ['null', null],
  ['undefined', undefined],
]

function appThrowing(thrown: unknown) {
  const app = createApp()

  app.get('/boom', () => {
    throw thrown
  })

  return app
}

function appRejecting(thrown: unknown) {
  const app = createApp()

  app.get('/boom', async () => {
    await Promise.resolve()
    throw thrown
  })

  return app
}

let consoleSpies: ReturnType<typeof spyOnConsole>

function spyOnConsole() {
  return LOG_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
}

function loggedText() {
  return consoleSpies.flatMap((spy) => spy.mock.calls).flat().map((arg) => inspect(arg)).join('\n')
}

function logCallCount() {
  return consoleSpies.reduce((count, spy) => count + spy.mock.calls.length, 0)
}

beforeEach(() => {
  consoleSpies = spyOnConsole()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('AppError', () => {
  it('отдаёт свой статус и message в формате {"error":...}', async () => {
    const response = await appThrowing(new AppError(403, 'Forbidden for this user')).request('/boom')

    expect(response.status).toBe(403)
    expect(response.headers.get('content-type')).toMatch(/^application\/json\b/)
    expect(await response.text()).toBe('{"error":"Forbidden for this user"}')
  })

  it('работает и в async-обработчике', async () => {
    const response = await appRejecting(new AppError(409, 'Conflict')).request('/boom')

    expect(response.status).toBe(409)
    expect(await response.text()).toBe('{"error":"Conflict"}')
  })

  it('не логируется', async () => {
    await appThrowing(new AppError(400, 'Bad input')).request('/boom')

    expect(logCallCount()).toBe(0)
  })
})

describe('HTTPException', () => {
  it('отдаёт статус и его стандартный текст вместо внутреннего message', async () => {
    const response = await appThrowing(new HTTPException(403, { message: `no access for ${EMAIL}` })).request('/boom')

    expect(response.status).toBe(403)
    expect(await response.text()).toBe('{"error":"Forbidden"}')
  })

  it('не использует тело и заголовки из res', async () => {
    const res = new Response('internal body', { status: 403, headers: { 'X-Internal': 'secret' } })

    const response = await appThrowing(new HTTPException(403, { res })).request('/boom')

    expect(response.status).toBe(403)
    expect(response.headers.has('x-internal')).toBe(false)
    expect(await response.text()).toBe('{"error":"Forbidden"}')
  })

  it('при статусе без стандартного текста отдаёт общий текст и исходный статус', async () => {
    const response = await appThrowing(new HTTPException(UNKNOWN_STATUS)).request('/boom')

    expect(response.status).toBe(UNKNOWN_STATUS)
    expect(await response.text()).toBe(INTERNAL_ERROR_BODY)
  })

  it('не логируется', async () => {
    await appThrowing(new HTTPException(400, { message: 'Bad' })).request('/boom')

    expect(logCallCount()).toBe(0)
  })
})

describe('неизвестная ошибка', () => {
  it.each([
    ['Error, sync', () => appThrowing(new Error(EMAIL))],
    ['TypeError, sync', () => appThrowing(new TypeError(EMAIL))],
    ['Error, async', () => appRejecting(new Error(EMAIL))],
    ['TypeError, async', () => appRejecting(new TypeError(EMAIL))],
  ])('%s: 500 и ровно общий текст', async (_name, createFailingApp) => {
    const response = await createFailingApp().request('/boom')

    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toMatch(/^application\/json\b/)
    expect(await response.text()).toBe(INTERNAL_ERROR_BODY)
  })

  it('в ответе нет стека, имён файлов и исходного сообщения', async () => {
    const response = await appThrowing(new Error(`Query failed for ${EMAIL}`)).request('/boom')
    const body = await response.text()

    expect(body).not.toContain(EMAIL)
    expect(body).not.toMatch(/\.ts\b|\.js\b|\bat\s/)
  })

  it('ошибка без стека даёт 500', async () => {
    const error = new TypeError(EMAIL)
    error.stack = undefined

    const response = await appThrowing(error).request('/boom')

    expect(response.status).toBe(500)
    expect(await response.text()).toBe(INTERNAL_ERROR_BODY)
    expect(loggedText()).toContain('TypeError')
    expect(loggedText()).not.toContain(EMAIL)
  })
})

describe('брошено не Error', () => {
  it.each(NON_ERRORS)('%s, sync: 500 в том же формате', async (_name, thrown) => {
    const response = await appThrowing(thrown).request('/boom')

    expect(response.status).toBe(500)
    expect(await response.text()).toBe(INTERNAL_ERROR_BODY)
  })

  it.each(NON_ERRORS)('%s, async: 500 в том же формате', async (_name, thrown) => {
    const response = await appRejecting(thrown).request('/boom')

    expect(response.status).toBe(500)
    expect(await response.text()).toBe(INTERNAL_ERROR_BODY)
  })

  it.each(NON_ERRORS)('%s: значение не попадает в лог, факт ошибки попадает', async (_name, thrown) => {
    await appThrowing(thrown).request('/boom')

    expect(logCallCount()).toBe(1)
    expect(loggedText()).toContain('Non-Error thrown')
    expect(loggedText()).not.toContain(EMAIL)
  })
})

describe('заголовки безопасности на ошибках', () => {
  it.each<[string, () => { request: (path: string) => Response | Promise<Response> }]>([
    ['404', createApp],
    ['500 от Error', () => appThrowing(new Error('boom'))],
    ['500 от не Error', () => appThrowing('boom')],
    ['AppError', () => appThrowing(new AppError(400, 'Bad'))],
    ['HTTPException', () => appThrowing(new HTTPException(400))],
  ])('%s', async (_name, createFailingApp) => {
    const response = await createFailingApp().request('/boom')

    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBeTruthy()
    expect(response.headers.get('strict-transport-security')).toMatch(/max-age=[1-9]\d*/)
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })
})

describe('логи неизвестной ошибки', () => {
  it('содержат только тип ошибки, метод и шаблон маршрута', async () => {
    await appThrowing(new TypeError('boom')).request('/boom')

    expect(console.error).toHaveBeenCalledExactlyOnceWith('TypeError', 'GET', '/boom')
    expect(loggedText()).not.toContain(TEST_FILE)
  })

  it('не содержат email из message', async () => {
    await appThrowing(new Error(`User ${EMAIL} not found`)).request('/boom')

    expect(loggedText()).not.toContain(EMAIL)
  })

  it('не содержат строку заголовка стека, даже если message изменён после чтения stack', async () => {
    const error = new Error(`User ${EMAIL} not found`)
    void error.stack
    error.message = 'Sanitized'

    await appThrowing(error).request('/boom')

    expect(loggedText()).not.toContain(EMAIL)
  })

  it.each([
    ['строка вида «at email»', `Query failed\n    at ${EMAIL}\nend`],
    ['первая строка с email', `${EMAIL}\nsecond line`],
    ['спецсимволы регулярных выражений', `a.b(c [$&\n    at ${EMAIL}`],
  ])('не содержат email из многострочного message: %s', async (_name, message) => {
    await appThrowing(new Error(message)).request('/boom')

    expect(loggedText()).not.toContain(EMAIL)
    expect(loggedText()).not.toContain(TEST_FILE)
  })
})

function withAppendedStack(text: string) {
  const error = new Error('outer')
  error.stack += `\n${text}`

  return error
}

function withChangedMessage() {
  const error = new Error(`Query failed\n    at ${EMAIL}:1:2`)
  void error.stack
  error.message = 'Sanitized'

  return error
}

function errorOfClassWithName(name: PropertyDescriptor) {
  class NamedError extends Error {}
  Object.defineProperty(NamedError, 'name', name)

  return new NamedError('boom')
}

describe.each(NON_DEVELOPMENT_ENVS)('NODE_ENV %s: стека нет в логе', (_envName, value) => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', value)
  })

  it.each(LOGGED_ERRORS)('%s', async (_name, createError, type) => {
    await appThrowing(createError()).request('/boom')

    expect(console.error).toHaveBeenCalledExactlyOnceWith(type, 'GET', '/boom')
    expect(loggedText()).not.toContain(EMAIL)
    expect(loggedText()).not.toContain(TEST_FILE)
  })
})

describe('NODE_ENV=development', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
  })

  it('в логе тип, метод, маршрут и стек', async () => {
    await appThrowing(new TypeError('boom')).request('/boom')

    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      'TypeError',
      'GET',
      '/boom',
      expect.stringContaining(TEST_FILE),
    )
  })

  it('AppError 500 логируется со стеком', async () => {
    await appThrowing(new AppError(500, 'Failed')).request('/boom')

    expect(loggedText()).toContain(TEST_FILE)
  })

  it('4xx по-прежнему не логируются', async () => {
    await appThrowing(new AppError(400, 'Bad input')).request('/boom')

    expect(logCallCount()).toBe(0)
  })

  it('значение брошенного не Error не логируется', async () => {
    await appThrowing(EMAIL).request('/boom')

    expect(console.error).toHaveBeenCalledExactlyOnceWith('Non-Error thrown', 'GET', '/boom')
  })

  it('ошибка без стека даёт 500', async () => {
    const error = new TypeError('boom')
    delete error.stack

    const response = await appThrowing(error).request('/boom')

    expect(response.status).toBe(500)
    expect(loggedText()).toContain('TypeError')
  })
})

describe('NODE_ENV читается при вызове', () => {
  it('одно приложение меняет лог вслед за окружением', async () => {
    const app = appThrowing(new TypeError('boom'))

    await app.request('/boom')
    vi.stubEnv('NODE_ENV', 'development')
    await app.request('/boom')
    vi.stubEnv('NODE_ENV', 'production')
    await app.request('/boom')

    const calls = vi.mocked(console.error).mock.calls
    expect(calls.map((call) => call.length)).toEqual([3, 4, 3])
  })
})

describe('тип ошибки в логе', () => {
  it.each<[string, () => Error, string]>([
    ['constructor подменён на экземпляре', () => Object.assign(new TypeError('boom'), { constructor: { name: EMAIL } }), 'TypeError'],
    ['constructor с нестроковым именем на экземпляре', () => Object.assign(new TypeError('boom'), { constructor: { name: { email: EMAIL } } }), 'TypeError'],
    ['constructor удалён на экземпляре', () => Object.assign(new TypeError('boom'), { constructor: undefined }), 'TypeError'],
    ['error.name из данных', () => Object.assign(new TypeError('boom'), { name: EMAIL }), 'TypeError'],
    ['нестроковое имя класса', () => errorOfClassWithName({ value: { email: EMAIL } }), 'Error'],
    ['пустое имя класса', () => errorOfClassWithName({ value: '' }), 'Error'],
    ['анонимный класс', () => new (class extends Error {})('boom'), 'Error'],
    ['свой класс', () => new (class QueryError extends Error {})('boom'), 'QueryError'],
  ])('%s', async (_name, createError, type) => {
    await appThrowing(createError()).request('/boom')

    expect(console.error).toHaveBeenCalledExactlyOnceWith(type, 'GET', '/boom')
    expect(loggedText()).not.toContain(EMAIL)
  })
})

describe('сбой внутри обработчика', () => {
  it.each<[string, () => Error]>([
    ['чтение имени класса бросает исключение', () => errorOfClassWithName({
      get() {
        throw new Error(EMAIL)
      },
    })],
    ['ответ нельзя собрать', () => new AppError(STATUS_WITHOUT_BODY, EMAIL)],
  ])('%s: метка в логе и ответ 500', async (_name, createError) => {
    const response = await appThrowing(createError()).request('/boom')

    expect(response.status).toBe(500)
    expect(await response.text()).toBe(INTERNAL_ERROR_BODY)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(console.error).toHaveBeenCalledExactlyOnceWith(ERROR_HANDLER_FAILED, 'GET', '/boom')
    expect(loggedText()).not.toContain(EMAIL)
  })
})

describe.each(['development', 'production'])('ответ при NODE_ENV=%s', (value) => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', value)
  })

  it.each(RESPONSES)('%s', async (_name, createThrown, status, body) => {
    const response = await appThrowing(createThrown()).request('/boom')

    expect(response.status).toBe(status)
    expect(await response.text()).toBe(body)
  })

  it('404', async () => {
    const response = await createApp().request('/no-such-route')

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('{"error":"Not Found"}')
  })
})

function appWithShareRoute(thrown: unknown) {
  const app = createApp()

  app.post(SHARE_ROUTE, () => {
    throw thrown
  })

  return app
}

function errorWithStack(stack: unknown) {
  const error = new TypeError('boom')
  Object.defineProperty(error, 'stack', { value: stack })

  return error
}

describe('логи: данные пользователя вне message', () => {
  it('нет email, если многострочный message изменён после чтения stack', async () => {
    const error = new Error(`Query failed\n    at ${EMAIL}`)
    void error.stack
    error.message = 'Sanitized'

    await appThrowing(error).request('/boom')

    expect(loggedText()).not.toContain(EMAIL)
    expect(loggedText()).not.toContain(TEST_FILE)
  })

  it('нет email, если к stack дописан Caused by', async () => {
    const error = new Error('outer')
    error.stack += `\nCaused by: Error: inner ${EMAIL}\n    at ${EMAIL}`

    await appThrowing(error).request('/boom')

    expect(loggedText()).not.toContain(EMAIL)
    expect(loggedText()).not.toContain(TEST_FILE)
  })

  it.each([
    ['хвост после позиции', `    at ${EMAIL}:1:2 trailing`],
    ['текст до at', `${EMAIL} at file.ts:1:2`],
  ])('нет email в строке stack, похожей на кадр: %s', async (_name, line) => {
    const error = new Error('outer')
    error.stack += `\n${line}`

    await appThrowing(error).request('/boom')

    expect(loggedText()).not.toContain(EMAIL)
  })

  it('при разработке кадр именованной функции есть в логе', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    function createNamedFrameError() {
      return new TypeError('boom')
    }

    await appThrowing(createNamedFrameError()).request('/boom')

    expect(loggedText()).toContain('createNamedFrameError')
  })

  it('нет email из error.name, в логе имя класса', async () => {
    const error = new TypeError('boom')
    error.name = EMAIL

    await appThrowing(error).request('/boom')

    expect(loggedText()).not.toContain(EMAIL)
    expect(loggedText()).toContain('TypeError')
  })

  it.each([
    ['без constructor', () => Object.assign(new Error('boom'), { constructor: undefined })],
    ['анонимный класс', () => new (class extends Error {})('boom')],
  ])('%s: в логе общее имя Error', async (_name, createError) => {
    await appThrowing(createError()).request('/boom')

    expect(loggedText()).toContain("'Error'")
  })
})

describe('логи: адрес запроса', () => {
  it.each<[string, unknown]>([
    ['неизвестная ошибка', new Error('boom')],
    ['AppError 500', new AppError(500, 'Failed')],
    ['HTTPException 503', new HTTPException(503)],
    ['не Error', 'boom'],
  ])('%s: шаблон маршрута и метод вместо токена', async (_name, thrown) => {
    const url = `/play/${SHARE_TOKEN}?student=${EMAIL}`

    await appWithShareRoute(thrown).request(url, { method: 'POST' })

    expect(logCallCount()).toBe(1)
    expect(loggedText()).toContain(SHARE_ROUTE)
    expect(loggedText()).toContain('POST')
    expect(loggedText()).not.toContain(SHARE_TOKEN)
    expect(loggedText()).not.toContain(EMAIL)
  })
})

describe('логирование по статусу', () => {
  it.each<[string, Error, number, string, string]>([
    ['AppError 500', new AppError(500, EMAIL), 500, `{"error":"${EMAIL}"}`, 'AppError'],
    ['AppError 503', new AppError(503, EMAIL), 503, `{"error":"${EMAIL}"}`, 'AppError'],
    ['HTTPException 500', new HTTPException(500, { message: EMAIL }), 500, INTERNAL_ERROR_BODY, 'HTTPException'],
    ['HTTPException 503', new HTTPException(503, { message: EMAIL }), 503, '{"error":"Service Unavailable"}', 'HTTPException'],
  ])('%s логируется без message, ответ прежний', async (_name, error, status, body, className) => {
    const response = await appThrowing(error).request('/boom')

    expect(response.status).toBe(status)
    expect(await response.text()).toBe(body)
    expect(logCallCount()).toBe(1)
    expect(loggedText()).toContain(className)
    expect(loggedText()).not.toContain(EMAIL)
  })

  it.each<[string, Error, number, string]>([
    ['AppError 400', new AppError(400, 'Bad input'), 400, '{"error":"Bad input"}'],
    ['AppError 401', new AppError(401, 'Sign in'), 401, '{"error":"Sign in"}'],
    ['AppError 404', new AppError(404, 'No such assignment'), 404, '{"error":"No such assignment"}'],
    ['HTTPException 400', new HTTPException(400), 400, '{"error":"Bad Request"}'],
    ['HTTPException 401', new HTTPException(401), 401, '{"error":"Unauthorized"}'],
    ['HTTPException 404', new HTTPException(404), 404, '{"error":"Not Found"}'],
  ])('%s не логируется, ответ прежний', async (_name, error, status, body) => {
    const response = await appThrowing(error).request('/boom')

    expect(response.status).toBe(status)
    expect(await response.text()).toBe(body)
    expect(logCallCount()).toBe(0)
  })
})

describe('логи: cause', () => {
  it.each<[string, Error]>([
    ['Error', new Error('outer', { cause: new Error(EMAIL) })],
    ['AppError 500', Object.assign(new AppError(500, 'Failed'), { cause: new Error(EMAIL) })],
    ['HTTPException 500', new HTTPException(500, { cause: new Error(EMAIL) })],
  ])('%s: cause не логируется', async (_name, error) => {
    await appThrowing(error).request('/boom')

    expect(logCallCount()).toBe(1)
    expect(loggedText()).not.toContain(EMAIL)
  })
})

describe('stack не строка', () => {
  it.each<[string, unknown]>([
    ['число', 123],
    ['null', null],
    ['undefined', undefined],
    ['Symbol', Symbol('stack')],
    ['объект с данными', { toString: () => EMAIL }],
  ])('%s: ответ 500, лог с именем класса', async (_name, stack) => {
    const response = await appThrowing(errorWithStack(stack)).request('/boom')

    expect(response.status).toBe(500)
    expect(await response.text()).toBe(INTERNAL_ERROR_BODY)
    expect(logCallCount()).toBe(1)
    expect(loggedText()).toContain('TypeError')
    expect(loggedText()).not.toContain(EMAIL)
  })

  it('stack удалён: ответ 500, лог с именем класса', async () => {
    const error = new TypeError('boom')
    delete error.stack

    const response = await appThrowing(error).request('/boom')

    expect(response.status).toBe(500)
    expect(loggedText()).toContain('TypeError')
  })

  it('stack не приводится к строке: обработчик не падает, ответ 500', async () => {
    const response = await appThrowing(errorWithStack(Object.create(null))).request('/boom')

    expect(response.status).toBe(500)
    expect(await response.text()).toBe(INTERNAL_ERROR_BODY)
    expect(logCallCount()).toBe(1)
  })
})
