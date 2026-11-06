import { inspect } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeCleanupExpiredAuthRecords, startCleanupSchedule } from '../src/features/auth'
import type { PasswordResetRepository, PendingRegistrationRepository, RefreshTokenRepository } from '../src/features/auth/types'
import { makeFakePendingRegistrations, makeMemoryPasswordResets, makeMemoryRefreshTokens } from './fakes/authFakes'

const NOW = new Date('2026-11-05T12:00:00Z')
const SECRET_IN_ERROR = 'qa-anna@example.test'

type Counts = { refreshTokens: number | Error; pendingRegistrations: number | Error; passwordResets?: number | Error }

// Репозитории, которые запоминают переданное now и возвращают заданное число удалённых строк или бросают
function setup(counts: Counts) {
  const seen: { refreshTokens?: Date; pendingRegistrations?: Date; passwordResets?: Date } = {}
  const refreshTokens: RefreshTokenRepository = {
    ...makeMemoryRefreshTokens([]).repository,
    async deleteExpired(now) {
      seen.refreshTokens = now
      if (counts.refreshTokens instanceof Error) throw counts.refreshTokens
      return counts.refreshTokens
    },
  }
  const pendingRegistrations: PendingRegistrationRepository = {
    ...makeFakePendingRegistrations([]).repository,
    async deleteExpired(now) {
      seen.pendingRegistrations = now
      if (counts.pendingRegistrations instanceof Error) throw counts.pendingRegistrations
      return counts.pendingRegistrations
    },
  }
  const passwordResets: PasswordResetRepository = {
    ...makeMemoryPasswordResets([]).repository,
    async deleteExpired(now) {
      seen.passwordResets = now
      const count = counts.passwordResets ?? 0
      if (count instanceof Error) throw count
      return count
    },
  }
  const clock = vi.fn(() => NOW)
  const cleanup = makeCleanupExpiredAuthRecords({ refreshTokens, pendingRegistrations, passwordResets, now: clock })
  return { cleanup, seen, clock }
}

function captureLogs() {
  const logged: { method: string; args: unknown[] }[] = []
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push({ method, args })
    })
  }
  return logged
}

function prismaLikeError(): Error {
  const error = new Error(`Invalid query: email = ${SECRET_IN_ERROR}`)
  error.name = 'PrismaClientKnownRequestError'
  return error
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cleanupExpiredAuthRecords', () => {
  it('все три deleteExpired получают одно и то же now, часы читаются один раз', async () => {
    captureLogs()
    const { cleanup, seen, clock } = setup({ refreshTokens: 0, pendingRegistrations: 0 })

    await cleanup()

    expect(seen.refreshTokens).toBe(NOW)
    expect(seen.pendingRegistrations).toBe(NOW)
    expect(seen.passwordResets).toBe(NOW)
    expect(clock).toHaveBeenCalledTimes(1)
  })

  it('ничего не удалено — в логе пусто', async () => {
    const logged = captureLogs()

    await setup({ refreshTokens: 0, pendingRegistrations: 0 }).cleanup()

    expect(logged).toEqual([])
  })

  it.each([
    ['только токены', 3, 0, 0],
    ['только регистрации', 0, 2, 0],
    ['только ссылки сброса', 0, 0, 4],
    ['все', 3, 2, 4],
  ])('удалено (%s) — одна запись в лог с числами', async (_name, refreshTokens, pendingRegistrations, passwordResets) => {
    const logged = captureLogs()

    await setup({ refreshTokens, pendingRegistrations, passwordResets }).cleanup()

    expect(logged).toEqual([
      { method: 'log', args: ['[cleanup] expired auth records removed', { refreshTokens, pendingRegistrations, passwordResets }] },
    ])
  })

  it.each([
    ['токены', { refreshTokens: prismaLikeError(), pendingRegistrations: 0 }],
    ['регистрации', { refreshTokens: 0, pendingRegistrations: prismaLikeError() }],
    ['ссылки сброса', { refreshTokens: 0, pendingRegistrations: 0, passwordResets: prismaLikeError() }],
  ])('сбой (%s) не бросается, в логе только тип ошибки', async (_name, counts) => {
    const logged = captureLogs()

    await expect(setup(counts).cleanup()).resolves.toBeUndefined()

    expect(logged).toEqual([{ method: 'error', args: ['[cleanup] failed', { errorType: 'PrismaClientKnownRequestError' }] }])
    expect(inspect(logged, { depth: null })).not.toContain(SECRET_IN_ERROR)
  })

  it('брошено не-Error — тип typeof, без исключения', async () => {
    const logged = captureLogs()
    const { cleanup } = setup({ refreshTokens: 0, pendingRegistrations: 0 })
    const throwing = makeCleanupExpiredAuthRecords({
      refreshTokens: { ...makeMemoryRefreshTokens([]).repository, deleteExpired: () => Promise.reject(SECRET_IN_ERROR) },
      pendingRegistrations: makeFakePendingRegistrations([]).repository,
      passwordResets: makeMemoryPasswordResets([]).repository,
      now: () => NOW,
    })

    await cleanup()
    await expect(throwing()).resolves.toBeUndefined()

    expect(logged).toEqual([{ method: 'error', args: ['[cleanup] failed', { errorType: 'string' }] }])
  })
})

// Таймеры подменяются: тик вызывается вручную, видно интервал, unref и снятие таймера
function makeFakeTimers() {
  const state = { tick: undefined as (() => void) | undefined, intervalMs: 0, unref: false, cleared: false }
  const timers = {
    setInterval: ((callback: () => void, ms: number) => {
      state.tick = callback
      state.intervalMs = ms
      return {
        unref() {
          state.unref = true
        },
      }
    }) as unknown as typeof setInterval,
    clearInterval: (() => {
      state.cleared = true
    }) as unknown as typeof clearInterval,
  }
  return { timers, state, tick: () => state.tick?.() }
}

// Очистка, которая завершается, только когда тест разрешит
function makeControlledCleanup() {
  const state = { calls: 0, finish: () => {} }
  const cleanup = () => {
    state.calls++
    return new Promise<void>((resolve) => {
      state.finish = resolve
    })
  }
  return { cleanup, state }
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

const HOUR_MS = 60 * 60 * 1000

describe('startCleanupSchedule', () => {
  it('первый запуск сразу, таймер на интервал с unref', () => {
    const fake = makeFakeTimers()
    const job = makeControlledCleanup()

    startCleanupSchedule({ cleanup: job.cleanup, intervalMs: HOUR_MS, timers: fake.timers })

    expect(job.state.calls).toBe(1)
    expect(fake.state.intervalMs).toBe(HOUR_MS)
    expect(fake.state.unref).toBe(true)
  })

  it('тики во время выполнения пропускаются, после окончания идут снова', async () => {
    const fake = makeFakeTimers()
    const job = makeControlledCleanup()
    startCleanupSchedule({ cleanup: job.cleanup, intervalMs: HOUR_MS, timers: fake.timers })

    fake.tick()
    fake.tick()
    expect(job.state.calls).toBe(1)

    job.state.finish()
    await settle()
    fake.tick()
    expect(job.state.calls).toBe(2)
  })

  it('ошибка запуска не всплывает, в логе только тип, расписание продолжается', async () => {
    const logged = captureLogs()
    const fake = makeFakeTimers()
    let calls = 0
    const schedule = startCleanupSchedule({
      cleanup: async () => {
        calls++
        throw prismaLikeError()
      },
      intervalMs: HOUR_MS,
      timers: fake.timers,
    })
    await settle()

    await expect(schedule.run()).resolves.toBeUndefined()
    fake.tick()
    await settle()

    expect(calls).toBe(3)
    expect(logged.every(({ method, args }) => method === 'error' && args[0] === '[cleanup] schedule run failed')).toBe(true)
    expect(logged[0]?.args[1]).toEqual({ errorType: 'PrismaClientKnownRequestError' })
    expect(inspect(logged, { depth: null })).not.toContain(SECRET_IN_ERROR)
  })

  it('синхронный throw в cleanup тоже не всплывает', async () => {
    captureLogs()
    const fake = makeFakeTimers()
    const throwing = (() => {
      throw new Error('sync boom')
    }) as unknown as () => Promise<void>

    const schedule = startCleanupSchedule({ cleanup: throwing, intervalMs: HOUR_MS, timers: fake.timers })

    await expect(schedule.run()).resolves.toBeUndefined()
  })

  it('run вручную во время тика не запускает вторую очистку', async () => {
    const fake = makeFakeTimers()
    const job = makeControlledCleanup()
    const schedule = startCleanupSchedule({ cleanup: job.cleanup, intervalMs: HOUR_MS, timers: fake.timers })

    const manual = schedule.run()
    job.state.finish()
    await manual

    expect(job.state.calls).toBe(1)
  })

  it('stop() снимает таймер', () => {
    const fake = makeFakeTimers()
    const schedule = startCleanupSchedule({ cleanup: makeControlledCleanup().cleanup, intervalMs: HOUR_MS, timers: fake.timers })

    schedule.stop()

    expect(fake.state.cleared).toBe(true)
  })

  it('с таймерами Node по умолчанию: тик через интервал, после stop тиков нет', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      const schedule = startCleanupSchedule({
        cleanup: async () => {
          calls++
        },
        intervalMs: HOUR_MS,
      })
      await vi.advanceTimersByTimeAsync(HOUR_MS - 1)
      expect(calls).toBe(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(calls).toBe(2)

      schedule.stop()
      await vi.advanceTimersByTimeAsync(HOUR_MS * 3)
      expect(calls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
