import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import PlayQuestion from './components/PlayQuestion.vue'
import { usePlayStore } from './store'

vi.mock('@/entities/quiz', () => ({
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const NO_SHUFFLE = () => 0.99
const mounted: { unmount: () => void }[] = []

function options(...texts: string[]) {
  return texts.map((text) => ({ text, imageUrl: null }))
}

function quiz(showAnswers: boolean) {
  return {
    type: 'quiz' as const,
    quiz: {
      title: 'Quiz',
      showAnswers,
      timer: { mode: 'none' } as const,
      version: 'v1',
      questions: [
        { text: 'Q1', imageUrl: null, options: options('a', 'b'), selectCount: 1 },
        { text: 'Q2', imageUrl: null, options: options('c', 'd'), selectCount: 1 },
        { text: 'Q3', imageUrl: null, options: options('e', 'f'), selectCount: 1 },
      ],
    },
  }
}

async function startQuiz(showAnswers: boolean) {
  vi.mocked(playApi.get).mockResolvedValue(quiz(showAnswers))
  vi.mocked(playApi.check).mockResolvedValue({ correct: [0] })
  const store = usePlayStore()
  await store.start(TOKEN, NO_SHUFFLE)
  return store
}

// Первый вопрос отвечен неверно (выбран вариант 1, верный 0), «Дальше» нажата: текущий — второй
async function answerFirst(store: ReturnType<typeof usePlayStore>) {
  store.toggle(1)
  await store.submit()
  await store.next()
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('стрелки викторины: store', () => {
  it('назад показывает выбор и отметки, уже полученные от сервера; check повторно не вызывается', async () => {
    const store = await startQuiz(true)
    await answerFirst(store)
    store.prev()
    expect(store.viewing).toBe(0)
    expect(store.question?.text).toBe('Q1')
    expect(store.isSelected(1)).toBe(true)
    expect(store.viewCorrect).toEqual([0])
    expect(store.isDisabled(0)).toBe(true)
    expect(store.canSubmit).toBe(false)
    expect(playApi.check).toHaveBeenCalledTimes(1)
  })

  it('вперёд не дальше текущего, назад не дальше первого', async () => {
    const store = await startQuiz(true)
    expect(store.canPrev).toBe(false)
    expect(store.canForward).toBe(false)
    await answerFirst(store)
    store.forward()
    expect(store.viewing).toBe(1)
    store.prev()
    store.prev()
    expect(store.viewing).toBe(0)
    store.forward()
    store.forward()
    expect(store.viewing).toBe(1)
  })

  it('при showAnswers=false отметок на прошлом вопросе нет, но выбор виден', async () => {
    const store = await startQuiz(false)
    await answerFirst(store)
    store.prev()
    expect(store.isSelected(1)).toBe(true)
    expect(store.viewCorrect).toBeNull()
    expect(playApi.check).not.toHaveBeenCalled()
  })

  it('возврат на текущий вопрос в фазе feedback сохраняет feedback и «Дальше»', async () => {
    const store = await startQuiz(true)
    await answerFirst(store)
    store.toggle(0)
    await store.submit()
    expect(store.phase).toBe('feedback')
    store.prev()
    expect(store.viewCorrect).toEqual([0])
    expect(store.feedback).toBeNull()
    await store.next()
    expect(store.current).toBe(1)
    store.forward()
    expect(store.viewing).toBe(1)
    expect(store.phase).toBe('feedback')
    expect(store.viewCorrect).toEqual([0])
    expect(store.feedback).toBe('correct')
  })

  it('выбор в процессе на текущем вопросе не теряется после просмотра прошлого', async () => {
    const store = await startQuiz(true)
    await answerFirst(store)
    store.toggle(0)
    store.prev()
    store.forward()
    expect(store.isSelected(0)).toBe(true)
    expect(store.canSubmit).toBe(true)
  })

  it('пока идёт запрос, стрелки неактивны', async () => {
    const store = await startQuiz(true)
    await answerFirst(store)
    let release: (value: { correct: number[] }) => void = () => undefined
    vi.mocked(playApi.check).mockReturnValue(new Promise((resolve) => (release = resolve)))
    store.toggle(0)
    const pending = store.submit()
    expect(store.busy).toBe(true)
    expect(store.canPrev).toBe(false)
    store.prev()
    expect(store.viewing).toBe(1)
    release({ correct: [0] })
    await pending
    expect(store.canPrev).toBe(true)
  })

  it('«Дальше» и отправка при просмотре прошлого ничего не делают', async () => {
    const store = await startQuiz(true)
    await answerFirst(store)
    store.toggle(0)
    await store.submit()
    store.prev()
    await store.next()
    expect(store.current).toBe(1)
    store.toggle(1)
    expect(store.isSelected(1)).toBe(true)
    expect(store.selected).toEqual([0])
  })
})

describe('стрелки викторины: таймер', () => {
  it('истечение времени при просмотре прошлого вопроса: finish один раз, как обычно', async () => {
    const store = await startQuiz(true)
    vi.mocked(playApi.finish).mockResolvedValue({ result: { percent: 0, grade: null, correctCount: 0, partialCount: 0, totalCount: 3 } })
    await answerFirst(store)
    store.prev()
    await store.expire()
    expect(playApi.finish).toHaveBeenCalledTimes(1)
    expect(store.phase).toBe('result')
  })
})

describe('стрелки викторины: разметка', () => {
  async function mountQuestion(showAnswers = true) {
    const store = await startQuiz(showAnswers)
    await answerFirst(store)
    const wrapper = await mountSuspended(PlayQuestion, { attachTo: document.body })
    mounted.push(wrapper)
    await flushPromises()
    return { store, wrapper }
  }

  it('кнопка «‹» ведёт на прошлый вопрос, счётчик и полоса показывают его номер, «Дальше» неактивна', async () => {
    const { wrapper } = await mountQuestion()
    const [prev, forward] = wrapper.findAll('.play-question__arrow')
    expect(prev?.attributes('disabled')).toBeUndefined()
    expect(forward?.attributes('disabled')).toBeDefined()
    await prev?.trigger('click')
    expect(wrapper.get('.play-question__progress').text()).toBe('1 / 3')
    expect(wrapper.get('.play-question__bar').attributes('value')).toBe('1')
    expect(wrapper.get('.play-question__text').text()).toBe('Q1')
    expect(wrapper.get('.play-question__action').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('.play-question__option').every((option) => option.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.find('.play-question__option--wrong').exists()).toBe(true)
    expect(wrapper.find('.play-question__option--missed').exists()).toBe(true)
  })

  it('после нажатия фокус остаётся на стрелке, а при её блокировке переходит на другую стрелку', async () => {
    const { wrapper } = await mountQuestion()
    const prev = wrapper.get('.play-question__arrow')
    ;(prev.element as HTMLButtonElement).focus()
    await prev.trigger('click')
    await flushPromises()
    expect(wrapper.get('.play-question__text').text()).toBe('Q1')
    expect(document.activeElement).toBe(wrapper.findAll('.play-question__arrow')[1]?.element)
    await wrapper.findAll('.play-question__arrow')[1]?.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(prev.element)
  })

  it('фокус остаётся на нажатой «›», даже если клик не поставил на неё фокус', async () => {
    const { store, wrapper } = await mountQuestion()
    store.toggle(0)
    await store.submit()
    await store.next()
    await flushPromises()
    const [prev, forward] = wrapper.findAll('.play-question__arrow')
    await prev?.trigger('click')
    await prev?.trigger('click')
    await flushPromises()
    expect(store.viewing).toBe(0)
    ;(document.activeElement as HTMLElement | null)?.blur()
    await forward?.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(forward?.element)
    expect(document.activeElement).not.toBe(prev?.element)
  })

  it('клавиши ←/→ работают и не двигают фокус; в полях ввода и с модификаторами игнорируются', async () => {
    const { store, wrapper } = await mountQuestion()
    const focused = document.activeElement
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await flushPromises()
    expect(store.viewing).toBe(0)
    expect(document.activeElement).toBe(focused)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(store.viewing).toBe(1)

    const input = document.createElement('input')
    document.body.append(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(store.viewing).toBe(1)
    input.remove()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true }))
    expect(store.viewing).toBe(1)

    wrapper.unmount()
    mounted.pop()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(store.viewing).toBe(1)
  })
})
