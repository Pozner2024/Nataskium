import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntroEntrance, IntroEntranceTargets } from '@/entities/intro-theme'
import { playApi } from '@/entities/quiz'
import { PLAYER_ENTRANCE_KEY, type PlayerEntrance } from '@/features/play-session'
import { usePlayStore } from '../store'
import PlayQuestion from './PlayQuestion.vue'

vi.mock('@/entities/quiz', () => ({
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const mounted: { unmount: () => void }[] = []

// Вылет подменён: проверяется договор вопроса с проигрывателем, а не движение
function fakeEntrance() {
  const state: { targets: IntroEntranceTargets | null; land: () => void } = { targets: null, land: () => {} }
  const entrance: IntroEntrance = {
    run: vi.fn((targets: IntroEntranceTargets) => {
      state.targets = targets
      targets.onReady()
      return new Promise<void>((resolve) => (state.land = resolve))
    }),
    cancel: vi.fn(() => state.land()),
  }
  return { entrance, state }
}

function playerContext(entrance: IntroEntrance | null): PlayerEntrance {
  let taken = false
  return {
    framed: true,
    take: vi.fn(() => {
      if (taken) return null
      taken = true
      return entrance
    }),
  }
}

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
  const store = usePlayStore()
  await store.start(TOKEN, () => 0.99)
  return store
}

async function mountQuestion(context: PlayerEntrance) {
  const wrapper = await mountSuspended(PlayQuestion, { attachTo: document.body, global: { provide: { [PLAYER_ENTRANCE_KEY as symbol]: context } } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => vi.resetAllMocks())

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('вылет первого вопроса (тема кодом)', () => {
  it('первый вопрос вылетает: рамка и точки окна, фокус на вопросе только после приземления, таймер с приземления', async () => {
    const store = await startQuiz()
    const restartClock = vi.spyOn(store, 'restartClock')
    const { entrance, state } = fakeEntrance()
    const question = await mountQuestion(playerContext(entrance))

    const card = question.get('.entrance-card')
    expect(card.classes()).toContain('entrance-card--framed')
    expect(card.classes()).toContain('entrance-card--entering')
    expect(question.find('.entrance-card__dots').exists()).toBe(true)
    expect(state.targets?.items.length).toBeGreaterThan(0)
    expect(document.activeElement?.tagName).not.toBe('H1')
    expect(restartClock).not.toHaveBeenCalled()

    state.land()
    await flushPromises()
    expect(card.classes()).not.toContain('entrance-card--entering')
    expect(document.activeElement?.textContent).toBe('Q1')
    expect(restartClock).toHaveBeenCalledTimes(1)
  })

  it('следующий вопрос и «Пройти ещё раз» без вылета, но с рамкой', async () => {
    await startQuiz()
    const { entrance, state } = fakeEntrance()
    const context = playerContext(entrance)
    await mountQuestion(context)
    state.land()
    await flushPromises()

    const again = await mountQuestion(context)
    expect(entrance.run).toHaveBeenCalledTimes(1)
    expect(again.get('.entrance-card').classes()).toContain('entrance-card--framed')
    expect(again.get('.entrance-card').classes()).not.toContain('entrance-card--waiting')
  })

  it('уход со страницы посреди вылета завершает его', async () => {
    await startQuiz()
    const { entrance } = fakeEntrance()
    const question = await mountQuestion(playerContext(entrance))
    mounted.splice(mounted.indexOf(question), 1)
    question.unmount()
    expect(entrance.cancel).toHaveBeenCalledTimes(1)
  })

  it('без проигрывателя вопрос как раньше: без рамки, сразу виден', async () => {
    await startQuiz()
    const question = await mountSuspended(PlayQuestion, { attachTo: document.body })
    mounted.push(question)
    await flushPromises()
    const card = question.get('.entrance-card')
    expect(card.classes()).not.toContain('entrance-card--framed')
    expect(card.classes()).not.toContain('entrance-card--waiting')
    expect(question.find('.entrance-card__dots').exists()).toBe(false)
  })
})
