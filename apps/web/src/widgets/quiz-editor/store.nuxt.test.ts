import { MAX_OPTIONS, MAX_QUESTIONS, MIN_OPTIONS } from '@nataskium/shared/schemas'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { quizApi } from '@/entities/quiz'
import { useAuthStore } from '@/features/auth'
import { ApiError } from '@/shared'
import { useQuizEditorStore } from './store'

let store: ReturnType<typeof useQuizEditorStore>

beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().setSession({ accessToken: 'access-1', teacher: { id: 't1', email: 'a@example.test', displayName: 'A', hasPassword: true, hasGoogle: false } })
  store = useQuizEditorStore()
})

describe('useQuizEditorStore: вопросы', () => {
  it('addQuestion добавляет вопрос и раскрывает его', () => {
    store.addQuestion()
    expect(store.quiz.questions).toHaveLength(2)
    expect(store.expandedIndex).toBe(1)
  })

  it('на 50-м вопросе addQuestion ничего не добавляет', () => {
    while (store.quiz.questions.length < MAX_QUESTIONS) store.addQuestion()
    store.addQuestion()
    expect(store.quiz.questions).toHaveLength(MAX_QUESTIONS)
  })

  it('removeQuestion не удаляет единственный вопрос', () => {
    store.removeQuestion(0)
    expect(store.quiz.questions).toHaveLength(1)
  })
})

describe('useQuizEditorStore: варианты', () => {
  it('addOption не больше 6 вариантов', () => {
    for (let i = 0; i < 10; i++) store.addOption(0)
    expect(store.quiz.questions[0]?.options).toHaveLength(MAX_OPTIONS)
  })

  it('removeOption при 2 вариантах не удаляет', () => {
    store.removeOption(0, 3)
    store.removeOption(0, 2)
    store.removeOption(0, 1)
    expect(store.quiz.questions[0]?.options).toHaveLength(MIN_OPTIONS)
  })

  it('removeOption не оставляет вопрос без верного варианта', () => {
    store.removeOption(0, 0)
    expect(store.quiz.questions[0]?.options.some((option) => option.isCorrect)).toBe(true)
  })

  it('toggleCorrect не снимает последний верный', () => {
    store.toggleCorrect(0, 0)
    expect(store.quiz.questions[0]?.options[0]?.isCorrect).toBe(true)
  })

  it('toggleCorrect не делает верными все варианты', () => {
    for (const index of [1, 2, 3]) store.toggleCorrect(0, index)
    expect(store.quiz.questions[0]?.options.filter((option) => !option.isCorrect)).toHaveLength(1)
    expect(store.quiz.questions[0]?.options[3]?.isCorrect).toBe(false)
  })
})

describe('useQuizEditorStore: isDirty', () => {
  it('новая викторина не изменена, правка включает isDirty', () => {
    expect(store.isDirty).toBe(false)
    store.quiz.title = 'Дроби'
    expect(store.isDirty).toBe(true)
  })

  it('после save с пробелами по краям isDirty = false', async () => {
    vi.spyOn(quizApi, 'create').mockImplementation(async (input) => ({
      quiz: {
        ...input,
        id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
        shareToken: 'abcdefghijklmnopqrstuv',
        questions: input.questions.map((question) => ({
          ...question,
          imageUrl: null,
          options: question.options.map((option) => ({ ...option, imageUrl: null })),
        })),
      },
    }))
    store.quiz.title = 'Дроби '
    store.quiz.questions[0]!.text = 'Q'
    store.quiz.questions[0]!.options.forEach((option, index) => {
      option.text = `o${index}`
    })
    expect(await store.save()).toBe(true)
    expect(store.isDirty).toBe(false)
  })
})

describe('useQuizEditorStore: правки во время сохранения', () => {
  it('поле, изменённое во время save, остаётся после ответа, isDirty = true', async () => {
    let resolveCreate: (value: Awaited<ReturnType<typeof quizApi.create>>) => void = () => undefined
    vi.spyOn(quizApi, 'create').mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)))
    store.quiz.title = 'Старое'
    store.quiz.questions[0]!.text = 'Q'
    store.quiz.questions[0]!.options.forEach((option, index) => {
      option.text = `o${index}`
    })
    const pending = store.save()

    store.quiz.title = 'Новое'
    resolveCreate({ quiz: { ...JSON.parse(JSON.stringify(store.quiz)), title: 'Старое', id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b', shareToken: 'abcdefghijklmnopqrstuv' } })
    await pending

    expect(store.quiz.title).toBe('Новое')
    expect(store.id).toBe('6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b')
    expect(store.isDirty).toBe(true)
  })
})

const IMAGE = { id: '1b2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', url: 'https://storage.example.test/quiz-images/1b2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f.webp' }
const OPTION_IMAGE = { id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', url: 'https://storage.example.test/quiz-images/2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f.webp' }
const QUIZ_ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'

function fillTexts(): void {
  store.quiz.title = 'Животные'
  store.quiz.questions[0]!.text = 'Где кошка?'
  store.quiz.questions[0]!.options.forEach((option, index) => {
    option.text = `o${index}`
  })
}

describe('useQuizEditorStore: картинки', () => {
  it('setQuestionImage ставит imageId и даёт превью, null убирает картинку', () => {
    store.setQuestionImage(0, IMAGE)
    expect(store.quiz.questions[0]?.imageId).toBe(IMAGE.id)
    expect(store.questionImageUrl(0)).toBe(IMAGE.url)
    expect(store.isDirty).toBe(true)

    store.setQuestionImage(0, null)
    expect(store.quiz.questions[0]?.imageId).toBeNull()
    expect(store.questionImageUrl(0)).toBeNull()
  })

  it('setOptionImage ставит и убирает картинку варианта', () => {
    store.setOptionImage(0, 1, OPTION_IMAGE)
    expect(store.quiz.questions[0]?.options[1]?.imageId).toBe(OPTION_IMAGE.id)
    expect(store.optionImageUrl(0, 1)).toBe(OPTION_IMAGE.url)

    store.setOptionImage(0, 1, null)
    expect(store.quiz.questions[0]?.options[1]?.imageId).toBeNull()
    expect(store.optionImageUrl(0, 1)).toBeNull()
  })

  it('addOption добавляет вариант без картинки', () => {
    store.addOption(0)
    expect(store.quiz.questions[0]?.options.at(-1)).toEqual({ text: '', imageId: null, isCorrect: false })
  })

  it('сохранение отправляет imageId, но не imageUrl', async () => {
    const create = vi.spyOn(quizApi, 'create').mockImplementation(async (input) => ({
      quiz: {
        ...input,
        id: QUIZ_ID,
        shareToken: SHARE_TOKEN,
        questions: input.questions.map((question) => ({
          ...question,
          imageUrl: question.imageId === null ? null : IMAGE.url,
          options: question.options.map((option) => ({ ...option, imageUrl: option.imageId === null ? null : OPTION_IMAGE.url })),
        })),
      },
    }))
    fillTexts()
    store.setQuestionImage(0, IMAGE)
    store.setOptionImage(0, 2, OPTION_IMAGE)
    store.quiz.questions[0]!.options[2]!.text = ''

    expect(await store.save()).toBe(true)

    const input = create.mock.calls[0]?.[0]
    expect(input?.questions[0]?.imageId).toBe(IMAGE.id)
    expect(input?.questions[0]?.options[2]).toEqual({ text: '', isCorrect: false, imageId: OPTION_IMAGE.id })
    expect(JSON.stringify(input)).not.toContain('imageUrl')
    expect(store.isDirty).toBe(false)
  })

  it('load берёт превью из ответа, в quiz imageUrl не попадает', async () => {
    vi.spyOn(quizApi, 'get').mockResolvedValue({
      quiz: {
        id: QUIZ_ID,
        shareToken: SHARE_TOKEN,
        title: 'Животные',
        showAnswers: true,
        gradingScale: null,
        group: 'other',
        questions: [
          {
            text: 'Где кошка?',
            imageId: IMAGE.id,
            imageUrl: IMAGE.url,
            options: [
              { text: '', isCorrect: true, imageId: OPTION_IMAGE.id, imageUrl: OPTION_IMAGE.url },
              { text: 'Собака', isCorrect: false, imageId: null, imageUrl: null },
            ],
          },
        ],
      },
    })

    await store.load(QUIZ_ID)

    expect(store.questionImageUrl(0)).toBe(IMAGE.url)
    expect(store.optionImageUrl(0, 0)).toBe(OPTION_IMAGE.url)
    expect(store.optionImageUrl(0, 1)).toBeNull()
    expect(JSON.stringify(store.quiz)).not.toContain('imageUrl')
    expect(store.isDirty).toBe(false)
  })

  it('вариант без текста и без картинки не уходит на сервер', async () => {
    const create = vi.spyOn(quizApi, 'create')
    fillTexts()
    store.quiz.questions[0]!.options[1]!.text = ''

    expect(await store.save()).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(store.fieldErrors['questions.0.options.1.text']).toBe('Text or image is required')
  })

  it('400 «Unknown image» при сохранении — saveStatus imageUnavailable', async () => {
    vi.spyOn(quizApi, 'create').mockRejectedValue(new ApiError(400, [], null, 'Unknown image'))
    fillTexts()
    store.setQuestionImage(0, IMAGE)

    expect(await store.save()).toBe(false)
    expect(store.saveStatus).toBe('imageUnavailable')
  })

  it('reset убирает превью', () => {
    store.setQuestionImage(0, IMAGE)
    store.reset()
    expect(store.questionImageUrl(0)).toBeNull()
  })
})
