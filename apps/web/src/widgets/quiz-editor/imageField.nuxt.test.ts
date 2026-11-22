import { IMAGE_TOO_LARGE_REASON, MAX_IMAGE_UPLOAD_BYTES } from '@nataskium/shared/schemas'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toRaw } from 'vue'
import { imageApi, quizApi, type QuizInput } from '@/entities/quiz'
import { useAuthStore } from '@/features/auth'
import { renderCrop } from './imageCrop'
import { useQuizEditorStore } from './store'
import QuizEditorPage from '@/pages/QuizEditorPage.vue'
import { ApiError } from '@/shared'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

// В happy-dom нет canvas: отрисовка обрезки подменена, расчёт рамки — настоящий
vi.mock('./imageCrop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./imageCrop')>()),
  renderCrop: vi.fn(),
}))

const SOURCE_URL = 'blob:qa-source'
const NATURAL_SIZE = 1000

const TEACHER = { id: 't1', email: 'qa-anna@example.test', displayName: 'Анна', hasPassword: true, hasGoogle: false }
const QUIZ_ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'
const IMAGE = { id: '1b2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', url: 'https://storage.example.test/quiz-images/1b2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f.webp' }
const NEXT_IMAGE = { id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', url: 'https://storage.example.test/quiz-images/2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f.webp' }

const mounted: { unmount: () => void }[] = []

beforeEach(() => {
  vi.restoreAllMocks()
  navigateToMock.mockReset()
  vi.mocked(renderCrop).mockReset()
  useAuthStore().setSession({ accessToken: 'access-1', teacher: TEACHER })
  // Окно обрезки открывает файл как картинку: в happy-dom это подменено
  vi.spyOn(URL, 'createObjectURL').mockReturnValue(SOURCE_URL)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue(undefined)
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(NATURAL_SIZE)
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(NATURAL_SIZE)
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

function optionField(wrapper: Wrapper, index: number) {
  return wrapper.findAll('.image-field--option')[index]!
}

type Field = ReturnType<typeof questionField>

const cropButton = (field: Field, text: string) => field.findAll('.app-dialog__actions button').find((button) => button.text() === text)!

// Файл не загружается сразу: сначала окно обрезки, «Не обрезать» отправляет исходный файл
async function skipCrop(field: Field): Promise<void> {
  await cropButton(field, 'Не обрезать').trigger('click')
  await flushPromises()
}

async function confirmCrop(field: Field): Promise<void> {
  await cropButton(field, 'Готово').trigger('click')
  await flushPromises()
}

async function dropOnOption(wrapper: Wrapper, index: number, files: File[]): Promise<void> {
  await optionField(wrapper, index).trigger('drop', { dataTransfer: transferOf(files) })
  await flushPromises()
  await skipCrop(optionField(wrapper, index))
}

async function fillValidQuiz(wrapper: Wrapper): Promise<void> {
  await wrapper.find('.quiz-editor__title-input').setValue('Животные')
  useQuizEditorStore().quiz.group = 'other'
  await wrapper.find('.question-card__text').setValue('Где кошка?')
  const names = ['Кошка', 'Собака', 'Рыбка', 'Птичка']
  for (const [index, option] of wrapper.findAll('.question-card__option-text').entries()) await option.setValue(names[index] ?? '')
}

async function openCrop(wrapper: Wrapper, files: File[]): Promise<void> {
  await questionField(wrapper).trigger('drop', { dataTransfer: transferOf(files) })
  await flushPromises()
}

async function dropOn(wrapper: Wrapper, files: File[]): Promise<void> {
  await openCrop(wrapper, files)
  await skipCrop(questionField(wrapper))
}

describe('ImageField: загрузка', () => {
  it('перетащили файл — imageApi.upload вызван, появилось превью', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    const file = imageFile()

    await dropOn(wrapper, [file])

    expect(upload).toHaveBeenCalledWith(file, 'access-1')
    expect(questionField(wrapper).find('.image-field__frame-img').attributes('src')).toBe(IMAGE.url)
  })

  it('вставили картинку из буфера — то же', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    const file = imageFile()

    await questionField(wrapper).trigger('paste', { clipboardData: transferOf([file]) })
    await flushPromises()
    await skipCrop(questionField(wrapper))

    expect(upload).toHaveBeenCalledWith(file, 'access-1')
    expect(questionField(wrapper).find('.image-field__frame-img').attributes('src')).toBe(IMAGE.url)
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

    await openCrop(wrapper, [imageFile('image/jpeg', MAX_IMAGE_UPLOAD_BYTES + 1)])

    expect(upload).not.toHaveBeenCalled()
    expect(questionField(wrapper).find('.image-crop').exists()).toBe(false)
    expect(questionField(wrapper).find('.image-field__error').text()).toBe('Файл слишком большой, максимум 15 МБ')
  })

  it('не картинка (PDF) — сообщение без запроса', async () => {
    const upload = vi.spyOn(imageApi, 'upload')
    const wrapper = await mountEditor()

    await openCrop(wrapper, [new File(['%PDF'], 'qa.pdf', { type: 'application/pdf' })])

    expect(upload).not.toHaveBeenCalled()
    expect(questionField(wrapper).find('.image-crop').exists()).toBe(false)
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
    await openCrop(wrapper, [imageFile()])
    await cropButton(questionField(wrapper), 'Не обрезать').trigger('click')

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
    expect(questionField(wrapper).find('.image-field__frame-img').attributes('src')).toBe(IMAGE.url)
  })

  it('выбор файла через input — загрузка и «Заменить»', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(NEXT_IMAGE)
    const wrapper = await mountEditor()
    const input = questionField(wrapper).find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: transferOf([imageFile('image/webp')]).files })

    await input.trigger('change')
    await flushPromises()
    await skipCrop(questionField(wrapper))

    expect(questionField(wrapper).find('.image-field__frame-img').attributes('src')).toBe(NEXT_IMAGE.url)
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

    expect(questionField(wrapper).find('.image-field__frame-img').exists()).toBe(false)
    expect(create.mock.calls[0]?.[0].questions[0]?.imageId).toBeNull()
  })

  it('сохранение отправляет imageId вопроса и варианта, но не imageUrl', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValueOnce(IMAGE).mockResolvedValueOnce(NEXT_IMAGE)
    const create = vi.spyOn(quizApi, 'create').mockImplementation(async (input) => saved(input))
    const wrapper = await mountEditor()
    await fillValidQuiz(wrapper)
    await dropOn(wrapper, [imageFile()])
    await dropOnOption(wrapper, 1, [imageFile()])
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
    const secondOption = () => optionField(wrapper, 1)
    await dropOnOption(wrapper, 1, [imageFile()])
    expect(useQuizEditorStore().quiz.questions[0]?.options[1]?.imageId).toBe(IMAGE.id)

    await secondOption().find('.image-field__remove').trigger('click')

    expect(useQuizEditorStore().quiz.questions[0]?.options[1]?.imageId).toBeNull()
    expect(secondOption().find('.image-field__preview').exists()).toBe(false)
  })

  it('вариант с картинкой подсказывает «Текст (необязательно)»', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    const option = () => wrapper.findAll('.question-card__option-text')[2]!

    expect(option().attributes('placeholder')).toBeUndefined()
    await dropOnOption(wrapper, 2, [imageFile()])

    expect(option().attributes('placeholder')).toBe('Текст (необязательно)')
  })

  it('вариант удалили во время загрузки — картинка не достаётся соседу', async () => {
    let finish: (image: typeof IMAGE) => void = () => undefined
    vi.spyOn(imageApi, 'upload').mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const wrapper = await mountEditor()
    await optionField(wrapper, 1).trigger('drop', { dataTransfer: transferOf([imageFile()]) })
    await flushPromises()
    await cropButton(optionField(wrapper, 1), 'Не обрезать').trigger('click')

    await wrapper.findAll('.question-card__remove-option')[1]!.trigger('click')
    finish(IMAGE)
    await flushPromises()

    expect(wrapper.findAll('.image-field--option .image-field__preview')).toHaveLength(0)
  })

  it('удаление варианта не переносит его картинку на соседа', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    await dropOnOption(wrapper, 2, [imageFile()])

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
    await skipCrop(questionField(wrapper))
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
    await dropOnOption(wrapper, 0, [imageFile()])

    const question = questionField(wrapper).get('.image-field__remove')
    const option = wrapper.findAll('.image-field--option')[0]!.get('.image-field__remove')
    expect(question.text()).toBe('✕')
    expect(question.attributes('aria-label')).toBe('Убрать картинку')
    expect(option.text()).toBe('Убрать')
    expect(option.attributes('aria-label')).toBe('Убрать картинку')
  })
})

describe('ImageField: окно обрезки', () => {
  it('выбранный файл не загружается сразу: открывается окно обрезки с рамкой 16:9', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()

    await openCrop(wrapper, [imageFile()])

    expect(upload).not.toHaveBeenCalled()
    const field = questionField(wrapper)
    expect(field.get('.app-dialog__title').text()).toBe('Обрезать картинку')
    expect(Number.parseFloat((field.get('.image-crop__frame').element as HTMLElement).style.aspectRatio)).toBeCloseTo(16 / 9)
    expect(field.find('.image-field__frame').exists()).toBe(false)
  })

  it('у варианта рамка квадратная', async () => {
    const wrapper = await mountEditor()
    await optionField(wrapper, 0).trigger('drop', { dataTransfer: transferOf([imageFile()]) })
    await flushPromises()
    expect(Number.parseFloat((optionField(wrapper, 0).get('.image-crop__frame').element as HTMLElement).style.aspectRatio)).toBe(1)
  })

  it('«Готово» загружает обрезанный файл, исходный остаётся в редакторе', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    vi.mocked(renderCrop).mockResolvedValue(new Blob(['cropped']))
    const wrapper = await mountEditor()
    const file = imageFile()
    await openCrop(wrapper, [file])

    await confirmCrop(questionField(wrapper))

    const sent = upload.mock.calls[0]![0]
    expect(sent).not.toBe(file)
    expect(await sent.text()).toBe('cropped')
    expect(questionField(wrapper).find('.image-crop').exists()).toBe(false)
    expect(questionField(wrapper).get('.image-field__frame-img').attributes('src')).toBe(IMAGE.url)
    expect(toRaw(useQuizEditorStore().questionImageSource(0))).toBe(file)
  })

  it('«Не обрезать» загружает исходный файл', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    const file = imageFile()

    await dropOn(wrapper, [file])

    expect(upload).toHaveBeenCalledOnce()
    expect(upload).toHaveBeenCalledWith(file, 'access-1')
    expect(renderCrop).not.toHaveBeenCalled()
    expect(toRaw(useQuizEditorStore().questionImageSource(0))).toBe(file)
  })

  it('«Отмена» и Esc: окно закрыто, ничего не загружено, картинки нет', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()

    await openCrop(wrapper, [imageFile()])
    await cropButton(questionField(wrapper), 'Отмена').trigger('click')
    expect(questionField(wrapper).find('.image-crop').exists()).toBe(false)

    await openCrop(wrapper, [imageFile()])
    await questionField(wrapper).get('dialog').trigger('cancel')
    expect(questionField(wrapper).find('.image-crop').exists()).toBe(false)

    expect(upload).not.toHaveBeenCalled()
    expect(questionField(wrapper).find('.image-field__frame').exists()).toBe(false)
    expect(useQuizEditorStore().quiz.questions[0]?.imageId).toBeNull()
  })

  it('файл не открылся как картинка — «Это не картинка», без загрузки', async () => {
    const upload = vi.spyOn(imageApi, 'upload')
    vi.spyOn(HTMLImageElement.prototype, 'decode').mockRejectedValue(new Error('broken'))
    const wrapper = await mountEditor()

    await openCrop(wrapper, [imageFile()])

    expect(upload).not.toHaveBeenCalled()
    expect(questionField(wrapper).find('.image-crop').exists()).toBe(false)
    expect(questionField(wrapper).find('.image-field__error').text()).toBe('Это не картинка. Подойдут JPEG, PNG, WebP')
  })

  it('пока окно открыто, перетаскивание не подсвечивает поле, а drop и вставка не подменяют файл', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    const first = imageFile()
    await openCrop(wrapper, [first])
    const field = questionField(wrapper)

    await field.trigger('dragover')
    expect(field.classes()).not.toContain('image-field--dragover')
    await field.trigger('drop', { dataTransfer: transferOf([imageFile('image/webp')]) })
    await field.trigger('paste', { clipboardData: transferOf([imageFile('image/webp')]) })
    await flushPromises()
    expect(URL.createObjectURL).toHaveBeenCalledOnce()

    await skipCrop(field)
    expect(upload).toHaveBeenCalledOnce()
    expect(upload).toHaveBeenCalledWith(first, 'access-1')
  })
})

describe('ImageField: «Изменить обрезку»', () => {
  it('после загрузки в редакторе: у вопроса «Изменить обрезку», у варианта «Обрезать», aria-label одинаковый', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    await dropOn(wrapper, [imageFile()])
    await dropOnOption(wrapper, 0, [imageFile()])

    const question = questionField(wrapper).get('.image-field__recrop')
    const option = optionField(wrapper, 0).get('.image-field__recrop')
    expect(question.text()).toBe('Изменить обрезку')
    expect(question.attributes('aria-label')).toBe('Изменить обрезку')
    expect(option.text()).toBe('Обрезать')
    expect(option.attributes('aria-label')).toBe('Изменить обрезку')
  })

  it('открывает окно с исходным файлом; «Готово» загружает новую обрезку, исходный файл тот же', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValueOnce(IMAGE).mockResolvedValueOnce(NEXT_IMAGE)
    vi.mocked(renderCrop).mockResolvedValue(new Blob(['recropped']))
    const wrapper = await mountEditor()
    const file = imageFile()
    await dropOn(wrapper, [file])

    await questionField(wrapper).get('.image-field__recrop').trigger('click')
    await flushPromises()
    expect(questionField(wrapper).find('.image-crop').exists()).toBe(true)
    expect(toRaw(vi.mocked(URL.createObjectURL).mock.lastCall?.[0])).toBe(file)
    await confirmCrop(questionField(wrapper))

    expect(upload).toHaveBeenCalledTimes(2)
    expect(await upload.mock.calls[1]![0].text()).toBe('recropped')
    expect(useQuizEditorStore().quiz.questions[0]?.imageId).toBe(NEXT_IMAGE.id)
    expect(toRaw(useQuizEditorStore().questionImageSource(0))).toBe(file)
    expect(questionField(wrapper).get('.image-field__frame-img').attributes('src')).toBe(NEXT_IMAGE.url)
  })

  it('«Отмена» в повторной обрезке оставляет прежнюю картинку', async () => {
    const upload = vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    await dropOn(wrapper, [imageFile()])

    await questionField(wrapper).get('.image-field__recrop').trigger('click')
    await flushPromises()
    await cropButton(questionField(wrapper), 'Отмена').trigger('click')

    expect(upload).toHaveBeenCalledOnce()
    expect(useQuizEditorStore().quiz.questions[0]?.imageId).toBe(IMAGE.id)
  })

  it('картинка из сохранённой викторины (исходного файла нет) — кнопки нет', async () => {
    vi.spyOn(quizApi, 'get').mockResolvedValue({
      quiz: {
        id: QUIZ_ID,
        shareToken: SHARE_TOKEN,
        title: 'Животные',
        showAnswers: true,
        gradingScale: null,
        group: 'other',
        timer: { mode: 'none' },
        introTheme: 'nataskium-night',
        questions: [{
          text: 'Где кошка?',
          imageId: IMAGE.id,
          imageUrl: IMAGE.url,
          options: [
            { text: 'Кошка', isCorrect: true, imageId: NEXT_IMAGE.id, imageUrl: NEXT_IMAGE.url },
            { text: 'Собака', isCorrect: false, imageId: null, imageUrl: null },
          ],
        }],
      },
    })
    const wrapper = await mountSuspended(QuizEditorPage, { props: { quizId: QUIZ_ID } })
    mounted.push(wrapper)
    await flushPromises()
    useQuizEditorStore().toggleExpanded(0)
    await flushPromises()

    expect(questionField(wrapper).get('.image-field__frame-img').attributes('src')).toBe(IMAGE.url)
    expect(optionField(wrapper, 0).get('.image-field__preview').attributes('src')).toBe(NEXT_IMAGE.url)
    expect(wrapper.find('.image-field__recrop').exists()).toBe(false)
  })

  it('после «✕» кнопки нет', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    await dropOn(wrapper, [imageFile()])

    await questionField(wrapper).get('.image-field__remove').trigger('click')

    expect(questionField(wrapper).find('.image-field__recrop').exists()).toBe(false)
  })
})

describe('ImageField: превью вопроса', () => {
  it('пустое поле вопроса подсказывает формат 16:9, у варианта подсказки формата нет', async () => {
    const wrapper = await mountEditor()
    expect(questionField(wrapper).get('.image-field__format').text()).toBe('Лучше горизонтальная картинка 16:9. После выбора её можно обрезать')
    expect(optionField(wrapper, 0).find('.image-field__format').exists()).toBe(false)
  })

  it('картинка вопроса в рамке с размытой копией-фоном: тот же адрес, скрыта от скринридера', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    await dropOn(wrapper, [imageFile()])

    const frame = questionField(wrapper).get('.image-field__frame')
    const backdrop = frame.get('.image-field__backdrop')
    expect(backdrop.attributes('src')).toBe(IMAGE.url)
    expect(backdrop.attributes('aria-hidden')).toBe('true')
    expect(backdrop.attributes('alt')).toBe('')
    expect(frame.get('.image-field__frame-img').attributes('alt')).toBe('')
    expect(questionField(wrapper).find('.image-field__format').exists()).toBe(false)
  })

  it('у варианта превью без рамки и копии-фона', async () => {
    vi.spyOn(imageApi, 'upload').mockResolvedValue(IMAGE)
    const wrapper = await mountEditor()
    await dropOnOption(wrapper, 0, [imageFile()])

    expect(optionField(wrapper, 0).get('.image-field__preview').attributes('src')).toBe(IMAGE.url)
    expect(optionField(wrapper, 0).find('.image-field__frame').exists()).toBe(false)
    expect(optionField(wrapper, 0).find('.image-field__backdrop').exists()).toBe(false)
  })
})
