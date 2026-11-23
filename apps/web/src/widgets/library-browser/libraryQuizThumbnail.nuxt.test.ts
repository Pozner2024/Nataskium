import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { LibraryThumbnail } from '@/entities/library'
import LibraryQuizThumbnail from './components/LibraryQuizThumbnail.vue'

const IMAGE_URL = 'https://img.test/question.png'

async function mountThumbnail(thumbnail: LibraryThumbnail | null, introTheme = 'nataskium-night') {
  return mountSuspended(LibraryQuizThumbnail, { props: { thumbnail, introTheme } })
}

const quiz = (overrides: Partial<Extract<LibraryThumbnail, { type: 'quiz' }>> = {}): LibraryThumbnail => ({
  type: 'quiz',
  text: 'Столица Франции?',
  imageUrl: null,
  options: [{ text: 'Париж' }, { text: 'Рим' }, { text: '' }, { text: 'Берлин' }],
  ...overrides,
})

describe('LibraryQuizThumbnail', () => {
  it('тон — из стиля задания; неизвестный стиль — тёмный по умолчанию', async () => {
    const day = await mountThumbnail(quiz(), 'nataskium-day')
    const unknown = await mountThumbnail(quiz(), 'gone-theme')

    expect(day.get('.intro-theme-preview').classes()).toContain('intro-theme-preview--light')
    expect(unknown.get('.intro-theme-preview').classes()).toContain('intro-theme-preview--dark')
  })

  it('викторина: вопрос и плашки ответов, вариант без текста — пустая плашка', async () => {
    const wrapper = await mountThumbnail(quiz())

    expect(wrapper.get('.library-quiz-thumbnail__text').text()).toBe('Столица Франции?')
    expect(wrapper.findAll('.library-quiz-thumbnail__option').map((option) => option.text())).toEqual(['Париж', 'Рим', '', 'Берлин'])
  })

  it('викторина с картинкой: ленивая загрузка; не открылась — картинка скрыта, текст на месте', async () => {
    const wrapper = await mountThumbnail(quiz({ imageUrl: IMAGE_URL }))
    const image = wrapper.get('img')

    expect(image.attributes('loading')).toBe('lazy')
    expect(image.attributes('src')).toBe(IMAGE_URL)

    await image.trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('.library-quiz-thumbnail__text').text()).toBe('Столица Франции?')
  })

  it('«да/нет»: утверждение и плашки «Да» и «Нет»', async () => {
    const wrapper = await mountThumbnail({ type: 'truefalse', statement: 'Земля круглая' })

    expect(wrapper.get('.library-quiz-thumbnail__text').text()).toBe('Земля круглая')
    expect(wrapper.findAll('.library-quiz-thumbnail__option').map((option) => option.text())).toEqual(['Да', 'Нет'])
  })

  it('сопоставление: определения и пустые плашки слов', async () => {
    const wrapper = await mountThumbnail({ type: 'matching', definitions: ['лает', 'мяукает', 'мычит'] })

    expect(wrapper.findAll('.library-quiz-thumbnail__definition').map((row) => row.text())).toEqual(['лает', 'мяукает', 'мычит'])
    const terms = wrapper.findAll('.library-quiz-thumbnail__term')
    expect(terms).toHaveLength(3)
    expect(terms.every((term) => term.text() === '')).toBe(true)
  })

  it('без превью — заглушка с полосками', async () => {
    const wrapper = await mountThumbnail(null)

    expect(wrapper.find('.intro-theme-preview__question').exists()).toBe(true)
  })

  it('HTML в текстах превью выводится текстом', async () => {
    const payload = '<img src=x onerror=alert(1)><b>жир</b>'
    const quizWrapper = await mountThumbnail(quiz({ text: payload, options: [{ text: payload }, { text: 'b' }] }))
    const matching = await mountThumbnail({ type: 'matching', definitions: [payload] })

    expect(quizWrapper.get('.library-quiz-thumbnail__text').text()).toBe(payload)
    expect(quizWrapper.find('b').exists()).toBe(false)
    expect(quizWrapper.find('img').exists()).toBe(false)
    expect(matching.get('.library-quiz-thumbnail__definition').text()).toBe(payload)
    expect(matching.find('b').exists()).toBe(false)
  })

  it('сопоставление с двумя определениями: две плашки слов', async () => {
    const wrapper = await mountThumbnail({ type: 'matching', definitions: ['лает', 'мяукает'] })

    expect(wrapper.findAll('.library-quiz-thumbnail__definition')).toHaveLength(2)
    expect(wrapper.findAll('.library-quiz-thumbnail__term')).toHaveLength(2)
  })
})
