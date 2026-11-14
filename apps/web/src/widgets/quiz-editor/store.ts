import { MAX_OPTIONS, MAX_QUESTIONS, MIN_OPTIONS, MIN_QUESTIONS, quizInputSchema } from '@nataskium/shared/schemas'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { newQuestion, newQuiz, quizApi, type QuizInput, type QuizResponse } from '@/entities/quiz'
import { authorizedRequest } from '@/features/auth'
import { ApiError } from '@/shared'

export type EditorView = 'questions' | 'settings'
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'notFound' | 'error'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'invalid' | 'tooLarge' | 'limitReached' | 'failed'

const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409
const PAYLOAD_TOO_LARGE_STATUS = 413

function cloneQuiz(quiz: QuizInput): QuizInput {
  return JSON.parse(JSON.stringify(quiz)) as QuizInput
}

// Ключ ошибки поля — путь из схемы через точку: `title`, `questions.0.text`, `questions.0.options.2.text`
function issuesToFieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of issues) {
    const key = issue.path.map(String).join('.')
    errors[key] ??= issue.message
  }
  return errors
}

function firstInvalidQuestion(errors: Record<string, string>): number | null {
  for (const key of Object.keys(errors)) {
    const [scope, index] = key.split('.')
    if (scope === 'questions' && index !== undefined) return Number(index)
  }
  return null
}

// Состояние редактора викторины. Токен берёт authorizedRequest; навигацию после создания делает виджет
export const useQuizEditorStore = defineStore('quiz-editor', () => {
  const quiz = ref<QuizInput>(newQuiz())
  const id = ref<string | null>(null)
  const shareToken = ref<string | null>(null)
  const expandedIndex = ref<number | null>(0)
  const view = ref<EditorView>('questions')
  const loadStatus = ref<LoadStatus>('idle')
  const saveStatus = ref<SaveStatus>('idle')
  const fieldErrors = ref<Record<string, string>>({})
  // Создание → переход на /teacher/quiz/<id>: старая страница не должна сбросить состояние при размонтировании
  const handoverId = ref<string | null>(null)
  // Растёт при reset: ответ load, начатого до сброса, уже не нужен
  let epoch = 0
  const savedSnapshot = ref(JSON.stringify(quiz.value))

  // Snapshot хранит форму после схемы (trim), поэтому сравниваем тоже нормализованную: пробелы по краям не «грязь»
  const isDirty = computed(() => {
    const parsed = quizInputSchema.safeParse(quiz.value)
    return JSON.stringify(parsed.success ? parsed.data : quiz.value) !== savedSnapshot.value
  })

  function addQuestion(): void {
    if (quiz.value.questions.length >= MAX_QUESTIONS) return
    quiz.value.questions.push(newQuestion())
    expandedIndex.value = quiz.value.questions.length - 1
  }

  function removeQuestion(index: number): void {
    if (quiz.value.questions.length <= MIN_QUESTIONS) return
    quiz.value.questions.splice(index, 1)
    fieldErrors.value = {}
    expandedIndex.value = null
  }

  function addOption(questionIndex: number): void {
    const question = quiz.value.questions[questionIndex]
    if (!question || question.options.length >= MAX_OPTIONS) return
    question.options.push({ text: '', isCorrect: false })
  }

  // Вопрос всегда сохраняет хотя бы один верный и хотя бы один неверный вариант (иначе «отметь все» даст полный балл)
  function removeOption(questionIndex: number, optionIndex: number): void {
    const question = quiz.value.questions[questionIndex]
    if (!question || question.options.length <= MIN_OPTIONS) return
    const rest = question.options.filter((_, index) => index !== optionIndex)
    if (!rest.some((option) => option.isCorrect) || rest.every((option) => option.isCorrect)) return
    question.options = rest
    fieldErrors.value = {}
  }

  function toggleCorrect(questionIndex: number, optionIndex: number): void {
    const question = quiz.value.questions[questionIndex]
    const option = question?.options[optionIndex]
    if (!question || !option) return
    const correctCount = question.options.filter((item) => item.isCorrect).length
    if (option.isCorrect && correctCount === 1) return
    if (!option.isCorrect && correctCount === question.options.length - 1) return
    option.isCorrect = !option.isCorrect
  }

  function toggleExpanded(index: number): void {
    expandedIndex.value = expandedIndex.value === index ? null : index
  }

  function apply(response: QuizResponse): void {
    const { id: quizId, shareToken: token, ...input } = response.quiz
    quiz.value = input
    id.value = quizId
    shareToken.value = token
    savedSnapshot.value = JSON.stringify(input)
    loadStatus.value = 'ready'
  }

  async function load(quizId: string): Promise<void> {
    loadStatus.value = 'loading'
    const startedEpoch = epoch
    try {
      const response = await authorizedRequest((accessToken) => quizApi.get(quizId, accessToken))
      if (startedEpoch !== epoch) return
      apply(response)
      expandedIndex.value = null
    } catch (error) {
      if (startedEpoch !== epoch) return
      loadStatus.value = error instanceof ApiError && error.status === NOT_FOUND_STATUS ? 'notFound' : 'error'
    }
  }

  // true — сохранено. Ошибки показываются у полей, expandedIndex переходит на первый неверный вопрос
  async function save(): Promise<boolean> {
    const parsed = quizInputSchema.safeParse(quiz.value)
    if (!parsed.success) {
      showFieldErrors(issuesToFieldErrors(parsed.error.issues))
      return false
    }
    fieldErrors.value = {}
    saveStatus.value = 'saving'
    const input = cloneQuiz(parsed.data)
    try {
      const currentId = id.value
      const response = await authorizedRequest((accessToken) =>
        currentId === null ? quizApi.create(input, accessToken) : quizApi.update(currentId, input, accessToken),
      )
      const { id: quizId, shareToken: token } = response.quiz
      id.value = quizId
      shareToken.value = token
      savedSnapshot.value = JSON.stringify(input)
      loadStatus.value = 'ready'
      saveStatus.value = 'saved'
      return true
    } catch (error) {
      handleSaveError(error)
      return false
    }
  }

  function showFieldErrors(errors: Record<string, string>): void {
    fieldErrors.value = errors
    saveStatus.value = 'invalid'
    const invalid = firstInvalidQuestion(errors)
    if (invalid !== null) expandedIndex.value = invalid
  }

  function handleSaveError(error: unknown): void {
    if (!(error instanceof ApiError)) {
      saveStatus.value = 'failed'
      return
    }
    if (error.status === PAYLOAD_TOO_LARGE_STATUS) saveStatus.value = 'tooLarge'
    else if (error.status === CONFLICT_STATUS) saveStatus.value = 'limitReached'
    else if (error.status === BAD_REQUEST_STATUS && error.issues.length > 0) showFieldErrors(issuesToFieldErrors(error.issues))
    else saveStatus.value = 'failed'
  }

  function reset(): void {
    quiz.value = newQuiz()
    id.value = null
    shareToken.value = null
    expandedIndex.value = 0
    view.value = 'questions'
    loadStatus.value = 'idle'
    saveStatus.value = 'idle'
    fieldErrors.value = {}
    handoverId.value = null
    epoch++
    savedSnapshot.value = JSON.stringify(quiz.value)
  }

  return {
    quiz,
    id,
    shareToken,
    expandedIndex,
    view,
    loadStatus,
    saveStatus,
    fieldErrors,
    isDirty,
    handoverId,
    addQuestion,
    removeQuestion,
    addOption,
    removeOption,
    toggleCorrect,
    toggleExpanded,
    load,
    save,
    reset,
  }
})
