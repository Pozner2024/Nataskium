import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { ANSWER_FEEDBACK_MS, usePlayStore } from '../store'
import PlayQuestion from './PlayQuestion.vue'
import PlayResult from './PlayResult.vue'

vi.mock('@/entities/quiz', () => ({
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const RESULT = { percent: 100, grade: null, correctCount: 2, partialCount: 0, totalCount: 2 }
const mounted: { unmount: () => void }[] = []

async function startQuiz() {
  vi.mocked(playApi.get).mockResolvedValue({
    type: 'quiz' as const,
    quiz: {
      title: 'Quiz',
      showAnswers: true,
      timer: { mode: 'none' },
      version: 'v1',
      introTheme: 'nataskium-night' as const,
      questions: [
        { text: 'Q1', imageUrl: null, options: [{ text: 'a', imageUrl: null }, { text: 'b', imageUrl: null }], selectCount: 1 },
        { text: 'Q2', imageUrl: null, options: [{ text: 'c', imageUrl: null }, { text: 'd', imageUrl: null }], selectCount: 1 },
      ],
    },
  })
  vi.mocked(playApi.check).mockResolvedValue({ correct: [0] })
  vi.mocked(playApi.finish).mockResolvedValue({ result: RESULT })
  const store = usePlayStore()
  await store.start(TOKEN, () => 0.99)
  return store
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.useRealTimers()
})

describe('фокус в игре', () => {
  it('после ответа фокус остаётся на заголовке вопроса, после автоперехода — на заголовке нового, затем итога', async () => {
    const store = await startQuiz()
    const question = await mountSuspended(PlayQuestion, { attachTo: document.body })
    mounted.push(question)
    await flushPromises()
    expect(document.activeElement?.tagName).toBe('H1')
    expect(document.activeElement?.textContent).toBe('Q1')

    store.toggle(0)
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()
    expect(store.phase).toBe('feedback')
    expect(document.activeElement).toBe(question.get('.play-question__text').element)
    expect(question.get('[aria-live="polite"]').text()).toBe('Верно')

    await vi.advanceTimersByTimeAsync(ANSWER_FEEDBACK_MS)
    await flushPromises()
    expect(document.activeElement?.textContent).toBe('Q2')

    store.toggle(0)
    await vi.advanceTimersByTimeAsync(ANSWER_FEEDBACK_MS)
    expect(store.phase).toBe('result')
    const result = await mountSuspended(PlayResult, { attachTo: document.body })
    mounted.push(result)
    await flushPromises()
    expect(document.activeElement).toBe(result.get('h1').element)
  })
})
