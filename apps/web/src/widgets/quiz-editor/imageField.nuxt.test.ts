import { IMAGE_TOO_LARGE_REASON, MAX_IMAGE_UPLOAD_BYTES } from '@nataskium/shared/schemas'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { imageApi, quizApi, type QuizInput } from '@/entities/quiz'
import { useAuthStore } from '@/features/auth'
import { useQuizEditorStore } from './store'
import QuizEditorPage from '@/pages/QuizEditorPage.vue'
import { ApiError } from '@/shared'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const TEACHER = { id: 't1', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const QUIZ_ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'
const IMAGE = { id: '1b2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', url: 'https://storage.example.test/quiz-images/1b2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f.webp' }
const NEXT_IMAGE = { id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', url: 'https://storage.example.test/quiz-images/2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f.webp' }

const mounted: { unmount: () => void }[] = []

beforeEach(() => {
  vi.restoreAllMocks()
  navigateToMock.mockReset()
  useAuthStore().setSession({ accessToken: 'access-1', teacher: TEACHER })
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

async function mountEditor() {
  const wrapper = await mountSuspended(QuizEditorPage)
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountEditor>>

function saved(input: QuizInput) {
  const questions = input.questions.map((question) => ({
    ...question,
    imageUrl: null,
    options: question.options.map((option) => ({ ...option, imageUrl: null })),
  }))
  return { quiz: { ...input, id: QUIZ_ID, shareToken: SHARE_TOKEN, questions } }
}

function imageFile(type = 'image/png', size = 3): File {
  return new File([new Uint8Array(size)], 'qa.png', { type })
}

// В happy-dom нет конструктора DataTransfer с files: подставляем объект той же формы
function transferOf(files: File[]): DataTransfer {
  const list = Object.assign([...files], { item: (index: number) => files[index] ?? null })
  return { files: list } as unknown as DataTransfer
}

function questionField(wrapper: Wrapper) {
  return wrapper.find('.image-field--question')
}

async function fillValidQuiz(wrapper: Wrapper): Promise<void> {
  await wrapper.find('.quiz-editor__title-input').setValue('Животные')
  useQuizEditorStore().quiz.group = 'other'
  await wrapper.find('.question-card__text').setValue('Где кошка?')
  const names = ['Кошка', 'Собака', 'Рыбка', 'Птичка']
  for (const [index, option] of wrapper.findAll('.question-card__option-text').entries()) await option.setValue(names[index] ?? '')
}

async function dropOn(wrapper: Wrapper, files: File[]): Promise<void> {
  await questionField(wrapper).trigger('drop', { dataTransfer: transferOf(files) })
  await flushPromises()
}

describe('ImageField: загрузка', () => {
  it('перетащили файл — imageApi.upload вызван, появилось превью', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    const file = imageFile()

    await dropOn(wrapper, [file])

    expect(upload).toHaveBeenCalledWith(file, 'access-1')
    expect(questionField(wrapper).find('.image-field__preview').attributes('src')).toBe(IMAGE.url)
  })

  it('вставили картинку из буфера — то же', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    const file = imageFile()

    await questionField(wrapper).trigger('paste', { clipboardData: transferOf([file]) })
    await flushPromises()

    expect(upload).toHaveBeenCalledWith(file, 'access-1')
    expect(questionField(wrapper).find('.image-field__preview').attributes('src')).toBe(IMAGE.url)
  })

  it('вставили только текст — запроса нет, ошибки нет', async () => {
    const upload = vi.spyOn(imageApi, 'upload')
    const wrapper = await mountEditor()

    await questionField(wrapper).trigger('paste', { clipboardData: transferOf([]) })
    await flushPromises()

    expect(upload).not.toHaveBeenCalled()
    expect(questionField(wrapper).find('.image-field__error').exists()).toBe(false)
  })

  it('файл больше 15 МБ — сообщение без запроса', async () => {
    const upload = vi.spyOn(imageApi, 'upload')
    const wrapper = await mountEditor()

    await dropOn(wrapper, [imageFile('image/jpeg', MAX_IMAGE_UPLOAD_BYTES + 1)])

    expect(upload).not.toHaveBeenCalled()
    expect(questionField(wrapper).find('.image-field__error').text()).toBe('Файл слишком большой, максимум 15 МБ')
  })

  it('не картинка (PDF) — сообщение без запроса', async () => {
    const upload = vi.spyOn(imageApi, 'upload')
    const wrapper = await mountEditor()

    await dropOn(wrapper, [new File(['%PDF'], 'qa.pdf', { type: 'application/pdf' })])

    expect(upload).not.toHaveBeenCalled()
    expect(questionField(wrapper).find('.image-field__error').text()).toBe('Это не картинка. Подойдут JPEG, PNG, WebP')
  })

  it('сервер не принял файл как картинку — «Это не картинка»', async () => {
    vi.spyOn(imageApi, 'upload').mockRejectedValue(new ApiError(400, [], null, 'Unsupported or corrupted image'))
    const wrapper = await mountEditor()

    await dropOn(wrapper, [imageFile()])

    expect(questionField(wrapper).find('.image-field__error').text()).toBe('Это не картинка. Подойдут JPEG, PNG, WebP')
  })

  it('413 при загрузке — «Файл слишком большой»', async () => {
    vi.spyOn(imageApi, 'upload').mockRejectedValue(new ApiError(413))
    const wrapper = await mountEditor()

    await dropOn(wrapper, [imageFile()])

    expect(questionField(wrapper).find('.image-field__error').text()).toBe('Файл слишком большой, максимум 15 МБ')
  })

  it('400 «File is too large» — «Файл слишком большой»', async () => {
    vi.spyOn(imageApi, 'upload').mockRejectedValue(new ApiError(400, [], null, IMAGE_TOO_LARGE_REASON))
    const wrapper = await mountEditor()

    await dropOn(wrapper, [imageFile()])

    expect(questionField(wrapper).find('.image-field__error').text()).toBe('Файл слишком большой, максимум 15 МБ')
  })

  it('поле вопроса убрали во время загрузки — результат не применяется', async () => {
    let finish: (image: typeof IMAGE) => void = () => undefined
    vi.spyOn(imageApi, 'upload').mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const wrapper = await mountEditor()
    await questionField(wrapper).trigger('drop', { dataTransfer: transferOf([imageFile()]) })

    useQuizEditorStore().toggleExpanded(0)
    await flushPromises()
    expect(questionField(wrapper).exists()).toBe(false)
    finish(IMAGE)
    await flushPromises()

    expect(useQuizEditorStore().quiz.questions[0]?.imageId).toBeNull()
  })

  it('ошибка сервера — сообщение, прежняя картинка остаётся', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValueOnce(IMAGE).mockRejectedValueOnce(new ApiError(503))
    const wrapper = await mountEditor()
    await dropOn(wrapper, [imageFile()])

    await dropOn(wrapper, [imageFile()])

    expect(upload).toHaveBeenCalledTimes(2)
    expect(questionField(wrapper).find('.image-field__error').text()).toBe('Не получилось загрузить картинку')
    expect(questionField(wrapper).find('.image-field__preview').attributes('src')).toBe(IMAGE.url)
  })

  it('выбор файла через input — загрузка и «Заменить»', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(NEXT_IMAGE)
    const wrapper = await mountEditor()
    const input = questionField(wrapper).find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: transferOf([imageFile('image/webp')]).files })

    await input.trigger('change')
    await flushPromises()

    expect(questionField(wrapper).find('.image-field__preview').attributes('src')).toBe(NEXT_IMAGE.url)
    expect(questionField(wrapper).find('.image-field__pick').text()).toBe('Заменить')
  })
})

describe('ImageField: в викторине', () => {
  it('«✕» убирает картинку: превью нет, в сохранении imageId: null', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const create = vi.spyOn(quizApi, 'create').mockImplementation(async (input) => saved(input))
    const wrapper = await mountEditor()
    await fillValidQuiz(wrapper)
    await dropOn(wrapper, [imageFile()])

    await questionField(wrapper).find('.image-field__remove').trigger('click')
    await wrapper.find('.quiz-editor__form').trigger('submit')
    await flushPromises()

    expect(questionField(wrapper).find('.image-field__preview').exists()).toBe(false)
    expect(create.mock.calls[0]?.[0].questions[0]?.imageId).toBeNull()
  })

  it('сохранение отправляет imageId вопроса и варианта, но не imageUrl', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValueOnce(IMAGE).mockResolvedValueOnce(NEXT_IMAGE)
    const create = vi.spyOn(quizApi, 'create').mockImplementation(async (input) => saved(input))
    const wrapper = await mountEditor()
    await fillValidQuiz(wrapper)
    await dropOn(wrapper, [imageFile()])
    await wrapper.findAll('.image-field--option')[1]!.trigger('drop', { dataTransfer: transferOf([imageFile()]) })
    await flushPromises()
    await wrapper.findAll('.question-card__option-text')[1]!.setValue('')

    await wrapper.find('.quiz-editor__form').trigger('submit')
    await flushPromises()

    expect(upload).toHaveBeenCalledTimes(2)
    const input = create.mock.calls[0]?.[0]
    expect(input?.questions[0]?.imageId).toBe(IMAGE.id)
    expect(input?.questions[0]?.options[1]).toEqual({ text: '', isCorrect: false, imageId: NEXT_IMAGE.id })
    expect(JSON.stringify(input)).not.toContain('imageUrl')
  })

  it('«✕» у варианта — imageId варианта null', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    const optionField = () => wrapper.findAll('.image-field--option')[1]!
    await optionField().trigger('drop', { dataTransfer: transferOf([imageFile()]) })
    await flushPromises()
    expect(useQuizEditorStore().quiz.questions[0]?.options[1]?.imageId).toBe(IMAGE.id)

    await optionField().find('.image-field__remove').trigger('click')

    expect(useQuizEditorStore().quiz.questions[0]?.options[1]?.imageId).toBeNull()
    expect(optionField().find('.image-field__preview').exists()).toBe(false)
  })

  it('вариант с картинкой подсказывает «Текст (необязательно)»', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    const option = () => wrapper.findAll('.question-card__option-text')[2]!

    expect(option().attributes('placeholder')).toBeUndefined()
    await wrapper.findAll('.image-field--option')[2]!.trigger('drop', { dataTransfer: transferOf([imageFile()]) })
    await flushPromises()

    expect(option().attributes('placeholder')).toBe('Текст (необязательно)')
  })

  it('вариант удалили во время загрузки — картинка не достаётся соседу', async () => {
    let finish: (image: typeof IMAGE) => void = () => undefined
    vi.spyOn(imageApi, 'upload').mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const wrapper = await mountEditor()
    await wrapper.findAll('.image-field--option')[1]!.trigger('drop', { dataTransfer: transferOf([imageFile()]) })

    await wrapper.findAll('.question-card__remove-option')[1]!.trigger('click')
    finish(IMAGE)
    await flushPromises()

    expect(wrapper.findAll('.image-field--option .image-field__preview')).toHaveLength(0)
  })

  it('удаление варианта не переносит его картинку на соседа', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    await wrapper.findAll('.image-field--option')[2]!.trigger('drop', { dataTransfer: transferOf([imageFile()]) })
    await flushPromises()

    await wrapper.findAll('.question-card__remove-option')[1]!.trigger('click')

    const previews = wrapper.findAll('.image-field--option').map((field) => field.find('.image-field__preview').exists())
    expect(previews).toEqual([false, true, false])
  })
})

describe('ImageField: подсветка и кнопка «Убрать»', () => {
  it('dragover включает подсветку, dragleave за пределы поля и drop снимают', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    const field = questionField(wrapper)

    await field.trigger('dragover')
    expect(field.classes()).toContain('image-field--dragover')
    await field.trigger('dragleave', { relatedTarget: null })
    expect(field.classes()).not.toContain('image-field--dragover')

    await field.trigger('dragover')
    await field.trigger('drop', { dataTransfer: transferOf([imageFile()]) })
    await flushPromises()
    expect(questionField(wrapper).classes()).not.toContain('image-field--dragover')
  })

  it('dragleave на дочерний элемент поля подсветку не снимает', async () => {
    const wrapper = await mountEditor()
    const field = questionField(wrapper)

    await field.trigger('dragover')
    await field.trigger('dragleave', { relatedTarget: field.find('.image-field__pick').element })

    expect(field.classes()).toContain('image-field--dragover')
  })

  it('у варианта «Убрать», у вопроса «✕», aria-label одинаковый', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    await dropOn(wrapper, [imageFile()])
    await wrapper.findAll('.image-field--option')[0]!.trigger('drop', { dataTransfer: transferOf([imageFile()]) })
    await flushPromises()

    const question = questionField(wrapper).get('.image-field__remove')
    const option = wrapper.findAll('.image-field--option')[0]!.get('.image-field__remove')
    expect(question.text()).toBe('✕')
    expect(question.attributes('aria-label')).toBe('Убрать картинку')
    expect(option.text()).toBe('Убрать')
    expect(option.attributes('aria-label')).toBe('Убрать картинку')
  })
})
