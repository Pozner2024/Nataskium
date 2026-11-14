import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { usePlayStore } from '../store'
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
    quiz: {
      title: 'Quiz',
      showAnswers: true,
      version: 'v1',
      questions: [
        { text: 'Q1', options: ['a', 'b'], selectCount: 1 },
        { text: 'Q2', options: ['c', 'd'], selectCount: 1 },
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
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('фокус в игре', () => {
  it('после «Ответить» фокус на «Дальше», затем на заголовке нового вопроса, затем на заголовке итога', async () => {
    const store = await startQuiz()
    const question = await mountSuspended(PlayQuestion, { attachTo: document.body })
    mounted.push(question)
    await flushPromises()
    expect(document.activeElement?.tagName).toBe('H1')
    expect(document.activeElement?.textContent).toBe('Q1')

    store.toggle(0)
    await store.submit()
    await flushPromises()
    expect(document.activeElement).toBe(question.get('.play-question__action').element)
    expect(question.get('[aria-live="polite"]').text()).toBe('Верно')

    await store.next()
    await flushPromises()
    expect(document.activeElement?.textContent).toBe('Q2')

    store.toggle(0)
    await store.submit()
    await store.next()
    const result = await mountSuspended(PlayResult, { attachTo: document.body })
    mounted.push(result)
    await flushPromises()
    expect(document.activeElement).toBe(result.get('h1').element)
  })
})
