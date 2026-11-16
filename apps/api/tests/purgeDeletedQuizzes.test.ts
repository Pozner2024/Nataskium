import { inspect } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DELETED_QUIZ_RETENTION_MS, makePurgeDeletedQuizzes } from '../src/features/quizzes'
import type { QuizRepository } from '../src/features/quizzes'
import { makeFakeQuizRepository } from './fakes/quizFakes'

const NOW = new Date('2026-11-16T12:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000
const RETENTION_DAYS = 30
// Попадает в текст ошибки репозитория — в логах его быть не должно
const SECRET_IN_ERROR = 'Контрольная по алгебре'

function setup(result: number | Error) {
  const seen: Date[] = []
  const quizzes: QuizRepository = {
    ...makeFakeQuizRepository(),
    async purgeDeletedBefore(olderThan) {
      seen.push(olderThan)
      if (result instanceof Error) throw result
      return result
    },
  }
  return { seen, purge: makePurgeDeletedQuizzes({ quizzes, now: () => NOW }) }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('purgeDeletedQuizzes (use-case)', () => {
  it('срок хранения удалённых — 30 дней от now', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { seen, purge } = setup(0)

    await purge()

    expect(DELETED_QUIZ_RETENTION_MS).toBe(RETENTION_DAYS * DAY_MS)
    expect(seen).toEqual([new Date(NOW.getTime() - RETENTION_DAYS * DAY_MS)])
  })

  it('в логе только количество удалённых', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { purge } = setup(3)

    await purge()

    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]).toEqual(['[quiz-cleanup] deleted quizzes purged', { quizzes: 3 }])
  })

  it('нечего удалять — в логе пусто', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { purge } = setup(0)

    await purge()

    expect(log).not.toHaveBeenCalled()
  })

  it('сбой базы не роняет процесс; в логе только тип ошибки', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { purge } = setup(new Error(`quiz "${SECRET_IN_ERROR}" is locked`))

    await expect(purge()).resolves.toBeUndefined()

    expect(errorLog).toHaveBeenCalledTimes(1)
    expect(inspect(errorLog.mock.calls)).not.toContain(SECRET_IN_ERROR)
  })
})
