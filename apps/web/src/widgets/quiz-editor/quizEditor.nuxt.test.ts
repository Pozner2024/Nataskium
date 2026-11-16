import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { quizApi } from '@/entities/quiz'
import { ApiError } from '@/shared'
import { useAuthStore } from '@/features/auth'
import QuizEditorPage from '@/pages/QuizEditorPage.vue'
import { useQuizEditorStore } from './store'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const TEACHER = { id: 't1', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'

function saved(input: Parameters<typeof quizApi.create>[0]) {
  const questions = input.questions.map((question) => ({
    ...question,
    imageUrl: null,
    options: question.options.map((option) => ({ ...option, imageUrl: null })),
  }))
  return { quiz: { ...input, id: ID, shareToken: SHARE_TOKEN, questions } }
}

const mounted: { unmount: () => void }[] = []

beforeEach(() => {
  vi.restoreAllMocks()
  navigateToMock.mockReset()
  useAuthStore().setSession({ accessToken: 'access-1', teacher: TEACHER })
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

async function mountNew() {
  const wrapper = await mountSuspended(QuizEditorPage)
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

async function fillValidQuiz(wrapper: Awaited<ReturnType<typeof mountNew>>) {
  await wrapper.find('.quiz-editor__title-input').setValue('Столицы')
  await wrapper.find('.question-card__text').setValue('Столица Франции?')
  const options = wrapper.findAll('.question-card__option-text')
  const names = ['Париж', 'Лион', 'Ницца', 'Лилль']
  for (const [index, option] of options.entries()) await option.setValue(names[index] ?? '')
}

describe('Редактор викторины: создание', () => {
  it('«Сохранить» вызывает quizApi.create и меняет адрес на /teacher/quiz/<id>', async () => {
    const create = vi.spyOn(quizApi, 'create').mockImplementation(async (input) => saved(input))
    const wrapper = await mountNew()
    await fillValidQuiz(wrapper)

    await wrapper.find('.quiz-editor__form').trigger('submit')
    await flushPromises()

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Столицы', showAnswers: true, gradingScale: null }), 'access-1')
    expect(navigateToMock).toHaveBeenCalledWith(`/teacher/quiz/${ID}`, { replace: true })
  })

  it('пустая форма не уходит на сервер: ошибки у полей', async () => {
    const create = vi.spyOn(quizApi, 'create')
    const wrapper = await mountNew()

    await wrapper.find('.quiz-editor__form').trigger('submit')
    await flushPromises()

    expect(create).not.toHaveBeenCalled()
    expect(wrapper.find('.quiz-editor__field-error').text()).toBe('Заполните это поле')
    expect(wrapper.find('.question-card__error').exists()).toBe(true)
  })

  it('ошибка 400 с issues — текст у поля вопроса', async () => {
    vi.spyOn(quizApi, 'create').mockRejectedValue(
      new ApiError(400, [{ path: ['questions', '0', 'text'], message: 'Text is required' }]),
    )
    const wrapper = await mountNew()
    await fillValidQuiz(wrapper)

    await wrapper.find('.quiz-editor__form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.question-card__error').text()).toBe('Заполните это поле')
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('409 при создании — сообщение о лимите заданий', async () => {
    vi.spyOn(quizApi, 'create').mockRejectedValue(new ApiError(409))
    const wrapper = await mountNew()
    await fillValidQuiz(wrapper)

    await wrapper.find('.quiz-editor__form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.quiz-editor__error-text').text()).toBe(
      'Достигнут лимит: не больше 100 заданий. Удалите ненужные, чтобы создать новое.',
    )
  })

  it('413 — «Викторина слишком большая»', async () => {
    vi.spyOn(quizApi, 'create').mockRejectedValue(new ApiError(413))
    const wrapper = await mountNew()
    await fillValidQuiz(wrapper)

    await wrapper.find('.quiz-editor__form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.quiz-editor__error-text').text()).toBe('Викторина слишком большая')
  })
})

describe('Редактор викторины: загрузка', () => {
  it('404 — «Задание не найдено» и ссылка в «Мои задания»', async () => {
    vi.spyOn(quizApi, 'get').mockRejectedValue(new ApiError(404))
    const wrapper = await mountSuspended(QuizEditorPage, { props: { quizId: ID } })
    mounted.push(wrapper)
    await flushPromises()

    expect(wrapper.text()).toContain('Задание не найдено')
    expect(wrapper.find('.quiz-editor__back-link').attributes('href')).toBe('/teacher')
  })

  it('«Настройки и ссылка» сохраняет и показывает ссылку ученика', async () => {
    const quiz = saved({ title: 'Дроби', showAnswers: true, gradingScale: null, group: 'other', questions: [{ text: 'Q', imageId: null, options: [{ text: 'a', isCorrect: true, imageId: null }, { text: 'b', isCorrect: false, imageId: null }] }] })
    vi.spyOn(quizApi, 'get').mockResolvedValue(quiz)
    const update = vi.spyOn(quizApi, 'update').mockResolvedValue(quiz)
    const wrapper = await mountSuspended(QuizEditorPage, { props: { quizId: ID } })
    mounted.push(wrapper)
    await flushPromises()

    await wrapper.find('.quiz-editor__settings').trigger('click')
    await flushPromises()

    expect(update).toHaveBeenCalled()
    const link = wrapper.find<HTMLInputElement>('.quiz-settings__link-input').element.value
    expect(link).toBe(`${window.location.origin}/play/${SHARE_TOKEN}`)
    expect(wrapper.find('.quiz-settings__preview').attributes('href')).toBe(`/play/${SHARE_TOKEN}?preview=1`)
  })
})

const FETCHED = saved({
  title: 'Дроби',
  showAnswers: true,
  gradingScale: null,
  group: 'other',
  questions: [{ text: 'Q', imageId: null, options: [{ text: 'a', isCorrect: true, imageId: null }, { text: 'b', isCorrect: false, imageId: null }] }],
})

describe('Редактор викторины: состояние между заходами', () => {
  it('переход после создания не сбрасывает store и не грузит заново: остаёмся на настройках', async () => {
    vi.spyOn(quizApi, 'create').mockImplementation(async (input) => saved(input))
    const get = vi.spyOn(quizApi, 'get')
    const wrapper = await mountNew()
    await fillValidQuiz(wrapper)
    // Как в роутере: navigateTo завершается, когда новая страница уже показана
    let finishNavigation: () => void = () => undefined
    navigateToMock.mockReturnValue(new Promise<void>((resolve) => (finishNavigation = resolve)))
    await wrapper.find('.quiz-editor__settings').trigger('click')
    await flushPromises()
    expect(useQuizEditorStore().view).toBe('settings')

    const next = await mountSuspended(QuizEditorPage, { props: { quizId: ID } })
    mounted.push(next)
    wrapper.unmount()
    mounted.shift()
    finishNavigation()
    await flushPromises()

    expect(get).not.toHaveBeenCalled()
    expect(useQuizEditorStore().view).toBe('settings')
    expect(next.find('.quiz-settings').exists()).toBe(true)
  })

  it('уход из редактора сбрасывает правки: повторный заход берёт данные с сервера', async () => {
    const get = vi.spyOn(quizApi, 'get').mockResolvedValue(FETCHED)
    const first = await mountSuspended(QuizEditorPage, { props: { quizId: ID } })
    await flushPromises()
    await first.find('.quiz-editor__title-input').setValue('Изменено')
    expect(useQuizEditorStore().isDirty).toBe(true)
    first.unmount()

    const second = await mountSuspended(QuizEditorPage, { props: { quizId: ID } })
    mounted.push(second)
    await flushPromises()

    expect(get).toHaveBeenCalledTimes(2)
    expect(useQuizEditorStore().isDirty).toBe(false)
    expect(second.find<HTMLInputElement>('.quiz-editor__title-input').element.value).toBe('Дроби')
  })

  it('начатая новая викторина после ухода открывается пустой', async () => {
    const first = await mountNew()
    await first.find('.quiz-editor__title-input').setValue('Черновик')
    first.unmount()
    mounted.length = 0

    const second = await mountNew()
    expect(second.find<HTMLInputElement>('.quiz-editor__title-input').element.value).toBe('')
  })
})

describe('Редактор викторины: переключатель «правильный»', () => {
  it('последний верный и последний неверный варианты заблокированы с пояснением', async () => {
    const wrapper = await mountNew()
    const boxes = wrapper.findAll('.question-card__correct')

    expect(boxes[0]?.attributes('disabled')).toBeDefined()
    expect(boxes[0]?.attributes('title')).toContain('Нельзя изменить')
    expect(boxes[1]?.attributes('disabled')).toBeUndefined()

    for (const index of [1, 2]) await boxes[index]?.setValue(true)
    expect(wrapper.findAll('.question-card__correct')[3]?.attributes('disabled')).toBeDefined()
  })
})

describe('Редактор викторины: передача после создания', () => {
  it('передача на другой id не пропускает загрузку', async () => {
    const get = vi.spyOn(quizApi, 'get').mockResolvedValue(FETCHED)
    useQuizEditorStore().handoverId = 'other-id'

    const wrapper = await mountSuspended(QuizEditorPage, { props: { quizId: ID } })
    mounted.push(wrapper)
    await flushPromises()

    expect(get).toHaveBeenCalledTimes(1)
  })

  it('reset во время незавершённого load: поздний ответ не применяется', async () => {
    let resolveGet: (value: typeof FETCHED) => void = () => undefined
    vi.spyOn(quizApi, 'get').mockReturnValue(new Promise((resolve) => (resolveGet = resolve)))
    const store = useQuizEditorStore()
    const pending = store.load(ID)

    store.reset()
    resolveGet(FETCHED)
    await pending

    expect(store.id).toBeNull()
    expect(store.loadStatus).toBe('idle')
    expect(store.quiz.title).toBe('')
  })
})

describe('Редактор викторины: сбой сохранения переключателя', () => {
  it('«Показывать ответы» возвращается к сохранённому значению', async () => {
    vi.spyOn(quizApi, 'get').mockResolvedValue(FETCHED)
    const update = vi.spyOn(quizApi, 'update').mockResolvedValue(FETCHED)
    const wrapper = await mountSuspended(QuizEditorPage, { props: { quizId: ID } })
    mounted.push(wrapper)
    await flushPromises()
    await wrapper.find('.quiz-editor__settings').trigger('click')
    await flushPromises()

    update.mockRejectedValue(new ApiError(500))
    await wrapper.find<HTMLInputElement>('#quiz-show-answers').setValue(false)
    await flushPromises()

    expect(useQuizEditorStore().quiz.showAnswers).toBe(true)
    expect(wrapper.find<HTMLInputElement>('#quiz-show-answers').element.checked).toBe(true)
  })
})
