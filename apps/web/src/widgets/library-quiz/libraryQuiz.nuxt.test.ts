import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNuxtState, useRouter } from '#imports'
import { type LibraryQuizCard, type LibraryQuizResponse, libraryApi } from '@/entities/library'
import { ApiError } from '@/shared'
import { formatLibraryDate } from './formatLibraryDate'
import LibraryQuiz from './LibraryQuiz.vue'
import LibraryQuizQuestion from './components/LibraryQuizQuestion.vue'

const NUMBER = 12
const CREATED_AT = '2026-11-15T10:00:00.000Z'
const IMAGE_URL = 'https://images.example.test/a.png'

const GROUPS = {
  groups: [
    { slug: 'geography', names: { ru: 'География', en: 'Geography', de: 'Geografie', fr: 'Géographie' } },
    { slug: 'other', names: { ru: 'Другое', en: 'Other', de: 'Sonstiges', fr: 'Autre' } },
  ],
}

type Question = LibraryQuizCard['questions'][number]

const QUESTIONS: Question[] = [
  {
    text: 'Столица Франции?',
    imageUrl: null,
    options: [
      { text: 'Париж', imageUrl: null },
      { text: 'Лион', imageUrl: null },
    ],
  },
  { text: 'Сколько будет 2 + 2?', imageUrl: null, options: [{ text: '4', imageUrl: null }] },
]

function quizBody(overrides: Partial<LibraryQuizCard> = {}): LibraryQuizResponse {
  return {
    quiz: {
      type: 'quiz',
      number: NUMBER,
      title: 'Столицы',
      groupSlug: 'geography',
      questionCount: QUESTIONS.length,
      graded: true,
      createdAt: CREATED_AT,
      questions: QUESTIONS,
      ...overrides,
    },
  }
}

let wrapper: VueWrapper

async function mountQuiz(route?: string) {
  wrapper = await mountSuspended(LibraryQuiz, { props: { number: NUMBER }, route })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  clearNuxtState('library-groups')
  vi.spyOn(libraryApi, 'groups').mockResolvedValue(GROUPS)
})

afterEach(async () => {
  wrapper.unmount()
  vi.restoreAllMocks()
  await useRouter().push('/')
})

describe('LibraryQuiz', () => {
  it('показывает название, группу, число вопросов, дату и оценивание', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody())
    await mountQuiz()

    expect(libraryApi.get).toHaveBeenCalledWith(NUMBER)
    expect(wrapper.find('h1').text()).toBe('Столицы')
    const meta = wrapper.find('.library-quiz__meta').text()
    expect(meta).toBe(`География · Вопросов: 2 · Добавлено ${formatLibraryDate(CREATED_AT, 'ru')}`)
    expect(meta).toContain('2026')
    expect(wrapper.find('.library-quiz__grade').text()).toBe('С оценкой')
    expect(wrapper.find('.library-quiz__grade--none').exists()).toBe(false)
  })

  it('без оценки — «Без оценки»', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody({ graded: false }))
    await mountQuiz()

    expect(wrapper.find('.library-quiz__grade').text()).toBe('Без оценки')
    expect(wrapper.find('.library-quiz__grade--none').exists()).toBe(true)
  })

  it('группа выводится на языке сайта', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody())
    await mountQuiz('/en/library/quiz/12')

    expect(wrapper.find('.library-quiz__meta').text()).toMatch(/^Geography · Questions: 2 · Added /)
    expect(wrapper.find('.library-quiz__grade').text()).toBe('Graded')
  })

  it('если группы не загрузились, мета остаётся без названия группы', async () => {
    vi.mocked(libraryApi.groups).mockRejectedValue(new ApiError(500))
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody())
    await mountQuiz()

    const meta = wrapper.find('.library-quiz__meta').text()
    expect(meta).toMatch(/^Вопросов: 2 · Добавлено /)
    expect(meta).not.toContain('География')
    expect(meta.startsWith('·')).toBe(false)
  })

  it('битая дата не показывается и не ломает мету', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody({ createdAt: 'не дата' }))
    await mountQuiz()

    expect(wrapper.find('.library-quiz__meta').text()).toBe('География · Вопросов: 2')
  })

  it('показывает вопросы и варианты по порядку', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody())
    await mountQuiz()

    const questions = wrapper.findAll('.library-quiz__question')
    expect(questions).toHaveLength(2)
    expect(questions[0]!.find('.library-quiz-question__number').text()).toBe('Вопрос 1')
    expect(questions[0]!.find('.library-quiz-question__text').text()).toBe('Столица Франции?')
    expect(questions[0]!.findAll('.library-quiz-question__option').map((option) => option.text())).toEqual(['Париж', 'Лион'])
    expect(questions[1]!.find('.library-quiz-question__number').text()).toBe('Вопрос 2')
    expect(wrapper.find('h2').text()).toBe('Вопросы')
  })

  it('в разметке нет признаков правильных ответов', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody())
    await mountQuiz()

    const html = wrapper.html()
    expect(wrapper.findAll('input, [role="radio"], [role="checkbox"], [aria-checked], [aria-selected]')).toHaveLength(0)
    expect(html).not.toMatch(/правильн/i)
    expect(html).not.toMatch(/correct/i)
    expect(html).not.toMatch(/--correct|is-correct|isCorrect/)
  })

  it('previewNote только когда вопросов в задании больше, чем показано', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody({ questionCount: 9 }))
    await mountQuiz()

    const notes = wrapper.findAll('.library-quiz__note').map((note) => note.text())
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('Показаны первые 2 из 9')
  })

  it('без previewNote, когда показаны все вопросы', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody())
    await mountQuiz()

    expect(wrapper.find('.library-quiz__note').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Показаны первые')
  })

  it('пустой список вопросов — noQuestions, без previewNote и списка', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody({ questions: [], questionCount: 0 }))
    await mountQuiz()

    expect(wrapper.find('.library-quiz__questions').exists()).toBe(false)
    expect(wrapper.findAll('.library-quiz__note').map((note) => note.text())).toEqual(['В этом задании пока нет вопросов'])
  })

  it('картинки вопроса и варианта декоративные: alt=""', async () => {
    const questions: Question[] = [
      { text: 'Что на фото?', imageUrl: IMAGE_URL, options: [{ text: '', imageUrl: `${IMAGE_URL}?v=2` }] },
    ]
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody({ questions, questionCount: 1 }))
    await mountQuiz()

    const images = wrapper.findAll('img')
    expect(images).toHaveLength(2)
    for (const image of images) expect(image.attributes('alt')).toBe('')
  })

  it('HTML-подобный текст выводится текстом, а не разметкой', async () => {
    const payload = '<img src=x onerror=alert(1)><b>жир</b>'
    const questions: Question[] = [{ text: payload, imageUrl: null, options: [{ text: payload, imageUrl: null }] }]
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody({ title: payload, questions, questionCount: 1 }))
    await mountQuiz()

    expect(wrapper.find('h1').text()).toBe(payload)
    expect(wrapper.find('.library-quiz-question__text').text()).toBe(payload)
    expect(wrapper.find('.library-quiz-question__option-text').text()).toBe(payload)
    expect(wrapper.find('b').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.html()).toContain('&lt;img src=x onerror=alert(1)&gt;&lt;b&gt;')
  })

  it('404 — событие not-found, карточки нет', async () => {
    vi.spyOn(libraryApi, 'get').mockRejectedValue(new ApiError(404))
    await mountQuiz()

    expect(wrapper.emitted('not-found')).toHaveLength(1)
    expect(wrapper.emitted('loaded')).toBeUndefined()
    expect(wrapper.find('h1').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it.each([0, 429, 500])('ошибка со статусом %i — сообщение с role="alert" и «Повторить», без not-found', async (code) => {
    vi.spyOn(libraryApi, 'get').mockRejectedValue(new ApiError(code))
    await mountQuiz()

    expect(wrapper.find('[role="alert"]').text()).toBe('Не получилось загрузить задания')
    expect(wrapper.find('.library-quiz__button').text()).toBe('Повторить')
    expect(wrapper.emitted('not-found')).toBeUndefined()
  })

  it('«Повторить» грузит заново и показывает карточку', async () => {
    const get = vi.spyOn(libraryApi, 'get').mockRejectedValueOnce(new ApiError(500))
    await mountQuiz()
    get.mockResolvedValue(quizBody())

    await wrapper.find('.library-quiz__button').trigger('click')
    await flushPromises()

    expect(get).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('h1').text()).toBe('Столицы')
    expect(wrapper.emitted('loaded')).toEqual([['Столицы']])
  })

  it('после загрузки сообщает название событием loaded', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody())
    await mountQuiz()

    expect(wrapper.emitted('loaded')).toEqual([['Столицы']])
  })

  it('пока идёт загрузка — role="status"', async () => {
    vi.spyOn(libraryApi, 'get').mockReturnValue(new Promise(() => {}))
    await mountQuiz()

    expect(wrapper.find('[role="status"]').text()).toBe('Загрузка…')
    expect(wrapper.find('h1').exists()).toBe(false)
  })

  it('«← К разделу» ведёт в группу задания', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody())
    await mountQuiz()

    const back = wrapper.find('.library-quiz__back')
    expect(back.text()).toBe('← К разделу')
    expect(back.attributes('href')).toBe('/library/geography')
  })

  it('на английском ссылка назад с префиксом /en', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody())
    await mountQuiz('/en/library/quiz/12')

    const back = wrapper.find('.library-quiz__back')
    expect(back.text()).toBe('← To the section')
    expect(back.attributes('href')).toBe('/en/library/geography')
  })
})

describe('LibraryQuizQuestion', () => {
  const withImages: Question = {
    text: 'Что на фото?',
    imageUrl: IMAGE_URL,
    options: [{ text: '', imageUrl: `${IMAGE_URL}?v=2` }],
  }

  async function mountQuestion(question: Question) {
    wrapper = await mountSuspended(LibraryQuizQuestion, { props: { number: 1, question } })
  }

  it('битая картинка вопроса скрывается целиком', async () => {
    await mountQuestion(withImages)
    expect(wrapper.find('.library-quiz-question__image').exists()).toBe(true)

    await wrapper.find('.library-quiz-question__image-img').trigger('error')

    expect(wrapper.find('.library-quiz-question__image').exists()).toBe(false)
    expect(wrapper.find('.library-quiz-question__option-img').exists()).toBe(true)
  })

  it('битая картинка варианта заменяется заглушкой', async () => {
    await mountQuestion(withImages)
    expect(wrapper.find('.library-quiz-question__option-fallback').exists()).toBe(false)

    await wrapper.find('.library-quiz-question__option-img').trigger('error')

    expect(wrapper.find('.library-quiz-question__option-img').exists()).toBe(false)
    expect(wrapper.find('.library-quiz-question__option-fallback').text()).toBe('Картинка не загрузилась')
    expect(wrapper.find('.library-quiz-question__image-img').exists()).toBe(true)
  })

  it('без картинок и текста блоки не рисуются', async () => {
    await mountQuestion({ text: '', imageUrl: null, options: [{ text: 'Да', imageUrl: null }] })

    expect(wrapper.find('.library-quiz-question__text').exists()).toBe(false)
    expect(wrapper.find('.library-quiz-question__image').exists()).toBe(false)
    expect(wrapper.find('.library-quiz-question__option-image').exists()).toBe(false)
  })
})
