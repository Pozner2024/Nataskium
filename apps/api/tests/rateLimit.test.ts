import { inspect } from 'node:util'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRODUCTION_LIMITS } from '../src/features/auth'
import { RateLimitedError } from '../src/shared/errors'
import { createRateLimiter, makeClientIpResolver } from '../src/shared/middleware'
import { fromIp } from './fakes/testApp'

const NOW = new Date('2026-11-05T12:00:00Z')
const MS_PER_MINUTE = 60 * 1000
const WINDOW_MS = 15 * MS_PER_MINUTE
const MAX = 3
const MAX_TRACKED_KEYS = 10
const EVICTION_TARGET = 9

function limiter(overrides: { max?: number; maxTrackedKeys?: number } = {}) {
  return createRateLimiter({ max: overrides.max ?? MAX, windowMs: WINDOW_MS, maxTrackedKeys: overrides.maxTrackedKeys ?? MAX_TRACKED_KEYS })
}

function hitTimes(target: ReturnType<typeof limiter>, key: string, times: number) {
  for (let index = 0; index < times; index++) target.hit(key)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PRODUCTION_LIMITS', () => {
  it('числа из плана 1.6', () => {
    expect(PRODUCTION_LIMITS).toEqual({
      maxTrackedKeys: 100_000,
      loginPerIp: { max: 100, windowMs: WINDOW_MS },
      loginPerIpEmail: { max: 10, windowMs: WINDOW_MS },
      loginFailuresPerEmail: { max: 10, windowMs: WINDOW_MS },
      registerPerIp: { max: 30, windowMs: 60 * MS_PER_MINUTE },
      verifyEmailPerIp: { max: 30, windowMs: WINDOW_MS },
      registrationEmailsPerHour: { max: 3, windowMs: 60 * MS_PER_MINUTE },
      registrationEmailsPerDay: { max: 5, windowMs: 24 * 60 * MS_PER_MINUTE },
      sessionPerIp: { max: 60, windowMs: WINDOW_MS },
    })
  })
})

describe('createRateLimiter: окно', () => {
  it(`пропускает ${MAX} попыток, следующую отклоняет с Retry-After до конца окна`, () => {
    const target = limiter()
    hitTimes(target, 'k', MAX)

    vi.setSystemTime(NOW.getTime() + MS_PER_MINUTE)

    expect(target.hit('k')).toEqual({ allowed: false, retryAfterSeconds: (WINDOW_MS - MS_PER_MINUTE) / 1000 })
  })

  it('Retry-After округляется вверх и не меньше 1 секунды', () => {
    const target = limiter()
    hitTimes(target, 'k', MAX)

    vi.setSystemTime(NOW.getTime() + WINDOW_MS - 1)

    expect(target.hit('k')).toEqual({ allowed: false, retryAfterSeconds: 1 })
  })

  it('после окна счёт начинается заново', () => {
    const target = limiter()
    hitTimes(target, 'k', MAX)

    vi.setSystemTime(NOW.getTime() + WINDOW_MS)

    expect(target.hit('k').allowed).toBe(true)
  })

  it('ключи считаются раздельно', () => {
    const target = limiter()
    hitTimes(target, 'a', MAX)

    expect(target.hit('b').allowed).toBe(true)
    expect(target.hit('a').allowed).toBe(false)
  })

  it('isAllowed не тратит попытку', () => {
    const target = limiter()
    for (let index = 0; index < MAX * 3; index++) target.isAllowed('k')

    expect(target.hit('k').allowed).toBe(true)
  })

  it('middleware бросает RateLimitedError', async () => {
    const target = limiter({ max: 1 })
    const app = new Hono()
    app.onError((error, c) => c.json({ type: error.name, retryAfter: (error as RateLimitedError).retryAfterSeconds }, 429))
    app.get('/', target.middleware(() => 'k'), (c) => c.text('ok'))

    expect((await app.request('/')).status).toBe(200)
    const blocked = await app.request('/')
    expect(await blocked.json()).toEqual({ type: 'RateLimitedError', retryAfter: WINDOW_MS / 1000 })
  })
})

describe('createRateLimiter: reserve и release', () => {
  it('release отменяет неудачу', () => {
    const target = limiter()
    for (let index = 0; index < MAX * 2; index++) {
      const reservation = target.reserve('k')
      if (reservation.allowed) reservation.release()
    }

    expect(target.hit('k').allowed).toBe(true)
  })

  it('без release неудачи копятся до лимита', () => {
    const target = limiter()
    for (let index = 0; index < MAX; index++) expect(target.reserve('k').allowed).toBe(true)

    expect(target.reserve('k')).toEqual({ allowed: false, retryAfterSeconds: WINDOW_MS / 1000 })
  })

  it('повторный release не снимает чужие неудачи: 3 резерва, один снят трижды — у ключа 2 неудачи', () => {
    const target = limiter()
    const first = target.reserve('k')
    target.reserve('k')
    target.reserve('k')

    if (first.allowed) {
      first.release()
      first.release()
      first.release()
    }

    expect(target.hit('k').allowed).toBe(true)
    expect(target.hit('k').allowed).toBe(false)
  })

  it('при max 2 двойной release снимает только одну неудачу', () => {
    const target = limiter({ max: 2 })
    const first = target.reserve('k')
    target.reserve('k')

    if (first.allowed) {
      first.release()
      first.release()
    }

    expect(target.reserve('k').allowed).toBe(true)
    expect(target.reserve('k').allowed).toBe(false)
  })

  it('release после смены окна не трогает новое окно', () => {
    const target = limiter()
    const old = target.reserve('k')
    vi.setSystemTime(NOW.getTime() + WINDOW_MS)
    hitTimes(target, 'k', MAX)

    if (old.allowed) old.release()

    expect(target.hit('k').allowed).toBe(false)
  })
})

describe('createRateLimiter: потолок ключей', () => {
  it('при переполнении вытесняются ключи с наименьшим счётчиком, ключи у порога остаются', () => {
    const target = limiter()
    hitTimes(target, 'victim', MAX)
    hitTimes(target, 'busy', MAX - 1)
    for (let index = 0; target.size() < MAX_TRACKED_KEYS; index++) target.hit(`noise-${index}`)

    target.hit('new-key')

    expect(target.size()).toBeLessThanOrEqual(EVICTION_TARGET + 1)
    expect(target.hit('victim').allowed).toBe(false)
    expect(target.isAllowed('busy').allowed).toBe(true)
    target.hit('busy')
    expect(target.hit('busy').allowed).toBe(false)
  })

  // До 90% потолка за раз, а не по одному ключу: иначе при заполненной Map сортировка шла бы на каждой вставке
  it('переполнение освобождает место с запасом, до 90% потолка', () => {
    const ceiling = 100
    const target = limiter({ maxTrackedKeys: ceiling })
    for (let index = 0; index < ceiling; index++) target.hit(`noise-${index}`)

    target.hit('overflow')

    expect(target.size()).toBe(ceiling * 0.9 + 1)
  })

  it('распределённый перебор не сбрасывает счётчик жертвы', () => {
    const target = limiter()
    hitTimes(target, 'victim', MAX)
    for (let index = 0; index < MAX_TRACKED_KEYS * 20; index++) target.hit(`attacker-${index}`)

    expect(target.hit('victim').allowed).toBe(false)
  })

  it('сначала удаляются истёкшие записи', () => {
    const target = limiter()
    for (let index = 0; index < MAX_TRACKED_KEYS; index++) hitTimes(target, `old-${index}`, MAX)
    vi.setSystemTime(NOW.getTime() + WINDOW_MS)

    hitTimes(target, 'fresh', MAX)

    expect(target.size()).toBe(1)
    expect(target.hit('fresh').allowed).toBe(false)
  })

  it('после неудачного полного прохода следующий — не раньше чем через секунду', () => {
    const target = limiter()
    for (let index = 0; index < MAX_TRACKED_KEYS; index++) hitTimes(target, `blocked-${index}`, MAX)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // За полсекунды до конца окна: проход не находит ни истёкших, ни вытесняемых ключей
    vi.setSystemTime(NOW.getTime() + WINDOW_MS - 500)
    target.hit('first-new')

    // Окно уже кончилось, но пауза ещё идёт: новый ключ не отслеживается, истёкшие не удалены
    vi.setSystemTime(NOW.getTime() + WINDOW_MS + 100)
    for (let index = 0; index < MAX + 2; index++) expect(target.hit('during-pause').allowed).toBe(true)
    expect(target.size()).toBe(MAX_TRACKED_KEYS)

    // Пауза кончилась: проход удаляет истёкшие, новый ключ снова считается
    vi.setSystemTime(NOW.getTime() + WINDOW_MS + 500)
    hitTimes(target, 'after-pause', MAX)
    expect(target.hit('after-pause').allowed).toBe(false)
    expect(target.size()).toBe(1)
  })

  it('при полной Map горячий ключ у порога остаётся заблокированным и во время паузы', () => {
    const target = limiter()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let index = 0; index < MAX_TRACKED_KEYS; index++) hitTimes(target, `blocked-${index}`, MAX)

    for (let index = 0; index < 50; index++) target.hit(`new-${index}`)

    expect(target.hit('blocked-0').allowed).toBe(false)
    expect(target.hit(`blocked-${MAX_TRACKED_KEYS - 1}`).allowed).toBe(false)
  })

  it('все ключи у порога — новый ключ не отслеживается, предупреждение не чаще раза в минуту и без ключей', () => {
    const warnings: unknown[] = []
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args)
    })
    const target = limiter()
    for (let index = 0; index < MAX_TRACKED_KEYS; index++) hitTimes(target, `blocked-qa-${index}@example.test`, MAX)

    for (let index = 0; index < MAX + 2; index++) expect(target.hit('untracked').allowed).toBe(true)
    target.hit('another-untracked')

    expect(target.size()).toBe(MAX_TRACKED_KEYS)
    expect(warnings).toHaveLength(1)
    expect(inspect(warnings, { depth: null })).not.toContain('@example.test')

    vi.setSystemTime(NOW.getTime() + MS_PER_MINUTE)
    target.hit('later')
    expect(warnings).toHaveLength(2)
  })
})

describe('makeClientIpResolver', () => {
  const TRUSTED = ['10.0.0.1', '172.18.0.0/16', 'fd00::1']

  function resolve(socketIp: string | undefined, realIp?: string, trusted = TRUSTED) {
    const resolver = makeClientIpResolver(trusted)
    const app = new Hono()
    app.onError((error, c) => c.text(`error: ${error.message}`, 500))
    app.get('/', (c) => c.text(resolver(c)))
    const headers = realIp === undefined ? undefined : { 'x-real-ip': realIp }
    return app.request('/', { headers }, socketIp === undefined ? {} : fromIp(socketIp))
  }

  it.each([
    ['без заголовка', '192.0.2.10', undefined, '192.0.2.10'],
    ['X-Real-IP от недоверенного адреса игнорируется', '192.0.2.10', '203.0.113.5', '192.0.2.10'],
    ['IPv4 в виде ::ffff: приводится к IPv4', '::ffff:192.0.2.10', undefined, '192.0.2.10'],
    ['доверенный адрес', '10.0.0.1', '203.0.113.5', '203.0.113.5'],
    ['доверенный через ::ffff:', '::ffff:10.0.0.1', '203.0.113.5', '203.0.113.5'],
    ['доверенный из CIDR', '172.18.5.6', '203.0.113.5', '203.0.113.5'],
    ['доверенный IPv6: ключ — сеть /64 из X-Real-IP', 'fd00::1', '2001:db8::5', '2001:db8:0:0::/64'],
    ['адрес рядом с CIDR не доверенный', '172.19.0.1', '203.0.113.5', '172.19.0.1'],
    ['X-Real-IP в виде ::ffff: приводится к IPv4', '10.0.0.1', '::ffff:203.0.113.5', '203.0.113.5'],
    ['X-Real-IP с пробелами', '10.0.0.1', ' 203.0.113.5 ', '203.0.113.5'],
  ])('%s', async (_name, socketIp, realIp, expected) => {
    expect(await (await resolve(socketIp, realIp)).text()).toBe(expected)
  })

  it.each([
    ['мусор', 'not-an-ip'],
    ['список через запятую', '203.0.113.5, 198.51.100.1'],
    ['пустой', ''],
  ])('доверенный прокси прислал неверный X-Real-IP (%s) — адрес прокси, в логе нет значения', async (_name, realIp) => {
    const warnings: unknown[] = []
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args)
    })

    expect(await (await resolve('10.0.0.1', realIp)).text()).toBe('10.0.0.1')
    if (realIp !== '') expect(inspect(warnings, { depth: null })).not.toContain(realIp)
  })

  // Клиенту IPv6 выдают целую /64: по полному адресу он обходил бы лимит, меняя адрес внутри сети
  it.each([
    ['сжатая запись', '2001:db8::1'],
    ['полная запись', '2001:0db8:0000:0000:0000:0000:0000:0001'],
    ['верхний регистр', '2001:DB8::1'],
    ['другой адрес той же /64', '2001:db8::abcd:1234'],
    ['другой адрес той же /64 в полной записи', '2001:db8:0:0:ffff:ffff:ffff:ffff'],
  ])('IPv6, одна сеть /64 — один ключ: %s', async (_name, socketIp) => {
    expect(await (await resolve(socketIp)).text()).toBe('2001:db8:0:0::/64')
  })

  it.each([
    ['соседняя /64', '2001:db8:0:1::1', '2001:db8:0:1::/64'],
    ['другой префикс', '2001:db9::1', '2001:db9:0:0::/64'],
    ['с зоной %eth0', 'fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['loopback ::1', '::1', '0:0:0:0::/64'],
    ['IPv4 в виде ::ffff: — полный IPv4', '::ffff:198.51.100.7', '198.51.100.7'],
  ])('IPv6: %s', async (_name, socketIp, expected) => {
    expect(await (await resolve(socketIp)).text()).toBe(expected)
  })

  it('разные /64 — разные ключи', async () => {
    const keys = await Promise.all(['2001:db8:0:1::1', '2001:db8:0:2::1', '2001:db8:1::1'].map(async (ip) => (await resolve(ip)).text()))

    expect(new Set(keys).size).toBe(3)
  })

  it('IPv4 — полный адрес, а не сеть', async () => {
    expect(await (await resolve('198.51.100.7')).text()).toBe('198.51.100.7')
    expect(await (await resolve('198.51.100.8')).text()).toBe('198.51.100.8')
  })

  it.each([
    ['IPv6 /64 из X-Real-IP', '2001:db8:aaaa:bbbb::9', '2001:db8:aaaa:bbbb::/64'],
    ['IPv6 с зоной в X-Real-IP', 'fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['::ffff: в X-Real-IP — полный IPv4', '::ffff:203.0.113.9', '203.0.113.9'],
  ])('доверенный IPv6-прокси: %s', async (_name, realIp, expected) => {
    expect(await (await resolve('fd00::1', realIp)).text()).toBe(expected)
  })

  // Доверие — по полному адресу, а не по сети /64: сосед прокси по сети подделать X-Real-IP не может
  it('недоверенный адрес из той же /64, что прокси — ключ по сокету, X-Real-IP игнорируется', async () => {
    expect(await (await resolve('fd00::2', '203.0.113.5')).text()).toBe('fd00:0:0:0::/64')
  })

  it('без списка доверенных X-Real-IP не используется никогда', async () => {
    expect(await (await resolve('10.0.0.1', '203.0.113.5', [])).text()).toBe('10.0.0.1')
  })

  it('нет адреса сокета — ошибка, а не общий ключ', async () => {
    const response = await resolve(undefined)

    expect(response.status).toBe(500)
    expect(await response.text()).toBe('error: Client address is unavailable')
  })
})
