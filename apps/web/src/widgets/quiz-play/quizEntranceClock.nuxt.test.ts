import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { usePlayStore } from './store'

vi.mock('@/entities/quiz', () => ({
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const START = new Date('2026-01-01T10:00:00Z').getTime()
const FLIGHT_MS = 5000

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
})

afterEach(() => vi.useRealTimers())

describe('usePlayStore.restartClock (вылет первого вопроса)', () => {
  it('до загрузки викторины отсчёт не запускается', () => {
    const store = usePlayStore()
    store.startedAt = null
    store.restartClock()
    expect(store.startedAt).toBeNull()
  })

  it('после загрузки ставит отсчёт на момент приземления, итог считает время от него', async () => {
    vi.mocked(playApi.get).mockResolvedValue({
      type: 'quiz' as const,
      quiz: {
        title: 'Quiz',
        showAnswers: false,
        timer: { mode: 'stopwatch' },
        version: 'v1',
        introTheme: 'nataskium-night' as const,
        questions: [{ text: 'Q1', imageUrl: null, options: [{ text: 'a', imageUrl: null }, { text: 'b', imageUrl: null }], selectCount: 1 }],
      },
    })
    const store = usePlayStore()
    await store.start(TOKEN, () => 0.99)
    expect(store.startedAt).toBe(START)

    vi.setSystemTime(START + FLIGHT_MS)
    store.restartClock()
    expect(store.startedAt).toBe(START + FLIGHT_MS)
  })
})
