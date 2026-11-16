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
  useQuizEditorStore().quiz.group = 'other'
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
    const quiz = saved({ title: 'Дроби', showAnswers: true, gradingScale: null, group: 'other', timer: { mode: 'none' }, questions: [{ text: 'Q', imageId: null, options: [{ text: 'a', isCorrect: true, imageId: null }, { text: 'b', isCorrect: false, imageId: null }] }] })
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
  timer: { mode: 'none' },
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

describe('Редактор викторины: таймер в настройках', () => {
  function withTimer(timer: Parameters<typeof saved>[0]['timer']) {
    return saved({
      title: 'Дроби',
      showAnswers: true,
      gradingScale: null,
      group: 'other',
      timer,
      questions: [{ text: 'Q', imageId: null, options: [{ text: 'a', isCorrect: true, imageId: null }, { text: 'b', isCorrect: false, imageId: null }] }],
    })
  }

  async function openSettings(timer: Parameters<typeof saved>[0]['timer']) {
    const quiz = withTimer(timer)
    vi.spyOn(quizApi, 'get').mockResolvedValue(quiz)
    const update = vi.spyOn(quizApi, 'update').mockImplementation(async (_id, input) => saved(input))
    const wrapper = await mountSuspended(QuizEditorPage, { props: { quizId: ID } })
    mounted.push(wrapper)
    await flushPromises()
    await wrapper.find('.quiz-editor__settings').trigger('click')
    await flushPromises()
    update.mockClear()
    return { wrapper, update }
  }

  const modeInput = (wrapper: Awaited<ReturnType<typeof mountNew>>, index: number) =>
    wrapper.findAll<HTMLInputElement>('input[name="quiz-timer"]')[index]!
  const NONE = 0
  const STOPWATCH = 1
  const LIMIT = 2
  const minutesInput = (wrapper: Awaited<ReturnType<typeof mountNew>>) => wrapper.find<HTMLInputElement>('#quiz-time-limit')

  async function typeMinutes(wrapper: Awaited<ReturnType<typeof mountNew>>, text: string) {
    const input = minutesInput(wrapper)
    input.element.value = text
    await input.trigger('input')
    await input.trigger('change')
    await flushPromises()
  }

  it('три режима в группе, выбран сохранённый, поле минут скрыто', async () => {
    const { wrapper } = await openSettings({ mode: 'none' })
    expect(wrapper.findAll('input[name="quiz-timer"]')).toHaveLength(3)
    expect(modeInput(wrapper, NONE).element.checked).toBe(true)
    expect(minutesInput(wrapper).exists()).toBe(false)
  })

  it('«Секундомер» сохраняет { mode: "stopwatch" }, поле минут не появляется', async () => {
    const { wrapper, update } = await openSettings({ mode: 'none' })
    await modeInput(wrapper, STOPWATCH).setValue(true)
    await flushPromises()
    expect(update).toHaveBeenCalledWith(ID, expect.objectContaining({ timer: { mode: 'stopwatch' } }), 'access-1')
    expect(minutesInput(wrapper).exists()).toBe(false)
  })

  it('«Лимит» сохраняет 600 с по умолчанию и показывает поле с 10 минутами', async () => {
    const { wrapper, update } = await openSettings({ mode: 'none' })
    await modeInput(wrapper, LIMIT).setValue(true)
    await flushPromises()
    expect(update).toHaveBeenCalledWith(ID, expect.objectContaining({ timer: { mode: 'limit', seconds: 600 } }), 'access-1')
    expect(minutesInput(wrapper).element.value).toBe('10')
  })

  it('возврат на «Без таймера» сохраняет { mode: "none" } без seconds и прячет поле', async () => {
    const { wrapper, update } = await openSettings({ mode: 'limit', seconds: 600 })
    await modeInput(wrapper, NONE).setValue(true)
    await flushPromises()
    expect(update).toHaveBeenCalledWith(ID, expect.objectContaining({ timer: { mode: 'none' } }), 'access-1')
    expect(minutesInput(wrapper).exists()).toBe(false)
  })

  it('загруженный лимит 900 с показан как «15» минут', async () => {
    const { wrapper } = await openSettings({ mode: 'limit', seconds: 900 })
    expect(modeInput(wrapper, LIMIT).element.checked).toBe(true)
    expect(minutesInput(wrapper).element.value).toBe('15')
  })

  it.each([['0'], ['181'], [''], ['5.5']])('значение «%s» не сохраняется и показывает ошибку', async (text) => {
    const { wrapper, update } = await openSettings({ mode: 'limit', seconds: 900 })
    await typeMinutes(wrapper, text)
    expect(update).not.toHaveBeenCalled()
    expect(wrapper.find('#quiz-time-limit-error').attributes('role')).toBe('alert')
    expect(wrapper.find('#quiz-time-limit-error').text()).not.toBe('')
    expect(minutesInput(wrapper).attributes('aria-invalid')).toBe('true')
    expect(minutesInput(wrapper).attributes('aria-describedby')).toContain('quiz-time-limit-error')
    expect(useQuizEditorStore().quiz.timer).toEqual({ mode: 'limit', seconds: 900 })
  })

  it('дробное значение — ошибка про целое число, выход за границы — про диапазон', async () => {
    const { wrapper } = await openSettings({ mode: 'limit', seconds: 900 })
    await typeMinutes(wrapper, '5.5')
    expect(wrapper.find('#quiz-time-limit-error').text()).toBe('Введите целое число минут')
    await typeMinutes(wrapper, '181')
    expect(wrapper.find('#quiz-time-limit-error').text()).toBe('Введите число от 1 до 180')
  })

  it('корректное значение по change сохраняется как минуты × 60, ошибка пропадает', async () => {
    const { wrapper, update } = await openSettings({ mode: 'limit', seconds: 900 })
    await typeMinutes(wrapper, '0')
    expect(wrapper.find('#quiz-time-limit-error').exists()).toBe(true)

    await typeMinutes(wrapper, '20')
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(ID, expect.objectContaining({ timer: { mode: 'limit', seconds: 1200 } }), 'access-1')
    expect(wrapper.find('#quiz-time-limit-error').exists()).toBe(false)
    expect(minutesInput(wrapper).attributes('aria-invalid')).toBe('false')
  })

  it('границы 1 и 180 минут допустимы', async () => {
    const { wrapper, update } = await openSettings({ mode: 'limit', seconds: 900 })
    await typeMinutes(wrapper, '1')
    await typeMinutes(wrapper, '180')
    expect(update).toHaveBeenNthCalledWith(1, ID, expect.objectContaining({ timer: { mode: 'limit', seconds: 60 } }), 'access-1')
    expect(update).toHaveBeenNthCalledWith(2, ID, expect.objectContaining({ timer: { mode: 'limit', seconds: 10800 } }), 'access-1')
  })

  it('то же значение не вызывает повторное сохранение', async () => {
    const { wrapper, update } = await openSettings({ mode: 'limit', seconds: 900 })
    await typeMinutes(wrapper, '15')
    expect(update).not.toHaveBeenCalled()
  })

  it('неудачное сохранение режима откатывает выбор', async () => {
    const { wrapper, update } = await openSettings({ mode: 'none' })
    update.mockRejectedValue(new ApiError(500))
    await modeInput(wrapper, LIMIT).setValue(true)
    await flushPromises()
    expect(useQuizEditorStore().quiz.timer).toEqual({ mode: 'none' })
    expect(modeInput(wrapper, NONE).element.checked).toBe(true)
    expect(minutesInput(wrapper).exists()).toBe(false)
  })

  it('неудачное сохранение минут возвращает прежнее значение в поле', async () => {
    const { wrapper, update } = await openSettings({ mode: 'limit', seconds: 900 })
    update.mockRejectedValue(new ApiError(500))
    await typeMinutes(wrapper, '20')
    expect(useQuizEditorStore().quiz.timer).toEqual({ mode: 'limit', seconds: 900 })
    expect(minutesInput(wrapper).element.value).toBe('15')
  })

  it('toQuizInput переносит timer: загрузка с сервера кладёт его в форму и в отправляемые данные', async () => {
    vi.spyOn(quizApi, 'get').mockResolvedValue(withTimer({ mode: 'limit', seconds: 1800 }))
    const store = useQuizEditorStore()
    await store.load(ID)
    expect(store.quiz.timer).toEqual({ mode: 'limit', seconds: 1800 })
    expect(store.isDirty).toBe(false)
    const update = vi.spyOn(quizApi, 'update').mockImplementation(async (_id, input) => saved(input))
    await store.save()
    expect(update).toHaveBeenCalledWith(ID, expect.objectContaining({ timer: { mode: 'limit', seconds: 1800 } }), 'access-1')
  })
})
