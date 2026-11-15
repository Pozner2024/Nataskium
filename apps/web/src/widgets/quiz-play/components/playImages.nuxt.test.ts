import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { usePlayStore } from '../store'
import PlayQuestion from './PlayQuestion.vue'

vi.mock('@/entities/quiz', () => ({
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const RESULT = { percent: 100, grade: null, correctCount: 1, partialCount: 0, totalCount: 1 }
const IMAGE_Q = 'https://storage.example/quiz-images/q.webp'
const IMAGE_A = 'https://storage.example/quiz-images/a.webp'
const IMAGE_B = 'https://storage.example/quiz-images/b.webp'
const mounted: { unmount: () => void }[] = []

// random = 0 переставляет [a, b, c] в [b, c, a]: на экране «Тигр», картинка без текста, «Кот»
async function startQuiz(showAnswers = false) {
  vi.mocked(playApi.get).mockResolvedValue({
    quiz: {
      title: 'Животные',
      showAnswers,
      version: 'v1',
      questions: [
        {
          text: 'Где кошка?',
          imageUrl: IMAGE_Q,
          options: [
            { text: 'Кот', imageUrl: IMAGE_A },
            { text: 'Тигр', imageUrl: null },
            { text: '', imageUrl: IMAGE_B },
          ],
          selectCount: 1,
        },
      ],
    },
  })
  vi.mocked(playApi.finish).mockResolvedValue({ result: RESULT })
  const store = usePlayStore()
  await store.start(TOKEN, () => 0)
  const wrapper = await mountSuspended(PlayQuestion)
  mounted.push(wrapper)
  await flushPromises()
  return { store, wrapper }
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('картинки на странице задания', () => {
  it('картинка вопроса над вариантами, у вариантов с текстом картинка декоративная', async () => {
    const { wrapper } = await startQuiz()
    const image = wrapper.get('.play-question__image-img')
    expect(image.attributes('src')).toBe(IMAGE_Q)
    expect(image.attributes('alt')).toBe('')

    const html = wrapper.html()
    expect(html.indexOf('play-question__image-img')).toBeLessThan(html.indexOf('play-question__options'))

    const buttons = wrapper.findAll('.play-question__option')
    expect(buttons.map((button) => button.text())).toEqual(['Тигр', '', 'Кот'])
    expect(buttons[2]!.get('img').attributes('src')).toBe(IMAGE_A)
    expect(buttons[2]!.get('img').attributes('alt')).toBe('')
    expect(buttons[2]!.attributes('aria-label')).toBeUndefined()
    expect(buttons[0]!.find('img').exists()).toBe(false)
  })

  it('вариант без текста называется «Картинка {n}», выбирается и уходит исходным индексом', async () => {
    const { store, wrapper } = await startQuiz()
    const button = wrapper.findAll('.play-question__option')[1]!
    expect(button.attributes('aria-label')).toBe('Картинка 2')
    expect(button.get('img').attributes('src')).toBe(IMAGE_B)

    await button.trigger('click')
    expect(store.selected).toEqual([2])
    await store.submit()
    expect(playApi.finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [[2]] })
  })

  it('после проверки отметка входит в название варианта без текста', async () => {
    vi.mocked(playApi.check).mockResolvedValue({ correct: [2] })
    const { store, wrapper } = await startQuiz(true)
    await wrapper.findAll('.play-question__option')[1]!.trigger('click')
    await store.submit()
    await flushPromises()
    expect(wrapper.findAll('.play-question__option')[1]!.attributes('aria-label')).toBe('Картинка 2, верно')
  })

  it('картинка не загрузилась — заглушка, вариант остаётся выбираемым', async () => {
    const { store, wrapper } = await startQuiz()
    await wrapper.get('.play-question__image-img').trigger('error')
    expect(wrapper.find('.play-question__image-img').exists()).toBe(false)
    expect(wrapper.get('.play-question__image-fallback').text()).toBe('Картинка не загрузилась')

    const button = wrapper.findAll('.play-question__option')[1]!
    await button.get('img').trigger('error')
    expect(button.find('img').exists()).toBe(false)
    expect(button.get('.play-question__option-fallback').text()).toBe('Картинка не загрузилась')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('aria-label')).toBe('Картинка 2')

    await button.trigger('click')
    expect(store.selected).toEqual([2])
  })
})

describe('модификатор варианта с картинкой', () => {
  it('play-question__option--image только у вариантов с imageUrl', async () => {
    const { wrapper } = await startQuiz()
    const flags = wrapper.findAll('.play-question__option').map((button) => button.classes().includes('play-question__option--image'))
    expect(flags).toEqual([false, true, true])
  })
})
