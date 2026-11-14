import { MAX_OPTIONS, MAX_QUESTIONS, MIN_OPTIONS } from '@nataskium/shared/schemas'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { quizApi } from '@/entities/quiz'
import { useAuthStore } from '@/features/auth'
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
      quiz: { ...input, id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b', shareToken: 'abcdefghijklmnopqrstuv' },
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
