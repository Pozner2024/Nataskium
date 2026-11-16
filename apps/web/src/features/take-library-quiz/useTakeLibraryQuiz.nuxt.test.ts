import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { ApiError, NETWORK_ERROR_STATUS } from '@/shared'
import type { TakeStatus } from './types'
import { useTakeLibraryQuiz } from './useTakeLibraryQuiz'

const QUIZ_ID = '0b6a9c1e-7f3d-4a52-9e1b-3c5d7f9a1b2c'

function setup(options: { signedIn?: boolean; take?: () => Promise<{ quizId: string }> } = {}) {
  const take = vi.fn(options.take ?? (() => Promise.resolve({ quizId: QUIZ_ID })))
  const onTaken = vi.fn()
  const onLoginRequired = vi.fn()
  const result = useTakeLibraryQuiz({ isSignedIn: () => options.signedIn ?? true, take, onTaken, onLoginRequired })
  return { ...result, take, onTaken, onLoginRequired }
}

describe('useTakeLibraryQuiz', () => {
  it('гость: копирование не запускается, просим войти', async () => {
    const { run, take, onLoginRequired, onTaken, status } = setup({ signedIn: false })

    await run()

    expect(take).not.toHaveBeenCalled()
    expect(onLoginRequired).toHaveBeenCalledTimes(1)
    expect(onTaken).not.toHaveBeenCalled()
    expect(status.value).toBe('idle')
  })

  it('вошедший: один вызов, статус taken и id копии', async () => {
    const { run, take, onTaken, onLoginRequired, status } = setup()

    await run()

    expect(take).toHaveBeenCalledTimes(1)
    expect(onTaken).toHaveBeenCalledWith(QUIZ_ID)
    expect(onLoginRequired).not.toHaveBeenCalled()
    expect(status.value).toBe('taken')
  })

  it('во время копирования статус taking и isBusy', async () => {
    let finish: (value: { quizId: string }) => void = () => undefined
    const { run, status, isBusy } = setup({ take: () => new Promise((resolve) => (finish = resolve)) })

    const pending = run()
    expect(status.value).toBe('taking')
    expect(isBusy.value).toBe(true)
    finish({ quizId: QUIZ_ID })
    await pending

    expect(status.value).toBe('taken')
  })

  it('два быстрых запуска подряд без await вызывают копирование один раз', async () => {
    const { run, take, onTaken } = setup()

    const first = run()
    const second = run()
    await Promise.all([first, second])

    expect(take).toHaveBeenCalledTimes(1)
    expect(onTaken).toHaveBeenCalledTimes(1)
  })

  it('после успеха повторный запуск игнорируется', async () => {
    const { run, take } = setup()

    await run()
    await run()

    expect(take).toHaveBeenCalledTimes(1)
  })

  it('401 (сессия потеряна): статус idle и просьба войти', async () => {
    const { run, onLoginRequired, onTaken, status } = setup({ take: () => Promise.reject(new ApiError(401)) })

    await run()

    expect(onLoginRequired).toHaveBeenCalledTimes(1)
    expect(onTaken).not.toHaveBeenCalled()
    expect(status.value).toBe('idle')
  })

  it.each<[number, TakeStatus]>([
    [404, 'notFound'],
    [409, 'limit'],
    [429, 'busy'],
    [503, 'storage'],
    [NETWORK_ERROR_STATUS, 'network'],
    [500, 'failed'],
    [400, 'failed'],
  ])('статус API %i даёт состояние %s и не ведёт на копию', async (code, expected) => {
    const { run, onTaken, onLoginRequired, status } = setup({ take: () => Promise.reject(new ApiError(code)) })

    await run()

    expect(status.value).toBe(expected)
    expect(onTaken).not.toHaveBeenCalled()
    expect(onLoginRequired).not.toHaveBeenCalled()
  })

  it('ошибка не из API (например, ответ не по схеме) даёт failed', async () => {
    const { run, status } = setup({ take: () => Promise.reject(new Error('boom')) })

    await run()

    expect(status.value).toBe('failed')
  })

  it('после ошибки повторное нажатие запускает копирование заново', async () => {
    const take = vi
      .fn<() => Promise<{ quizId: string }>>()
      .mockRejectedValueOnce(new ApiError(503))
      .mockResolvedValueOnce({ quizId: QUIZ_ID })
    const onTaken = vi.fn()
    const { run, status } = useTakeLibraryQuiz({ isSignedIn: () => true, take, onTaken, onLoginRequired: vi.fn() })

    await run()
    expect(status.value).toBe('storage')
    await run()

    expect(take).toHaveBeenCalledTimes(2)
    expect(status.value).toBe('taken')
    expect(onTaken).toHaveBeenCalledWith(QUIZ_ID)
  })

  it('компонент убран до ответа: переход к копии не вызывается', async () => {
    let finish: (value: { quizId: string }) => void = () => undefined
    const take = vi.fn(() => new Promise<{ quizId: string }>((resolve) => (finish = resolve)))
    const onTaken = vi.fn()
    const scope = effectScope()
    const { run } = scope.run(() => useTakeLibraryQuiz({ isSignedIn: () => true, take, onTaken, onLoginRequired: vi.fn() }))!

    const pending = run()
    scope.stop()
    finish({ quizId: QUIZ_ID })
    await pending

    expect(take).toHaveBeenCalledTimes(1)
    expect(onTaken).not.toHaveBeenCalled()
  })

  it('компонент убран до ответа с ошибкой 401: окно входа не открывается', async () => {
    let fail: (error: unknown) => void = () => undefined
    const take = vi.fn(() => new Promise<{ quizId: string }>((_resolve, reject) => (fail = reject)))
    const onLoginRequired = vi.fn()
    const scope = effectScope()
    const { run } = scope.run(() => useTakeLibraryQuiz({ isSignedIn: () => true, take, onTaken: vi.fn(), onLoginRequired }))!

    const pending = run()
    scope.stop()
    fail(new ApiError(401))
    await pending

    expect(onLoginRequired).not.toHaveBeenCalled()
  })

  it('isBusy: false в покое и после ошибки, true во время и после успеха', async () => {
    const { run, isBusy } = setup({ take: () => Promise.reject(new ApiError(500)) })
    expect(isBusy.value).toBe(false)

    await run()

    expect(isBusy.value).toBe(false)
  })
})
