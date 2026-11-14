import { shareTokenSchema } from '@nataskium/shared/schemas'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { playApi, type QuizResult } from '@/entities/quiz'
import { ApiError } from '@/shared'
import { shuffle } from './shuffle'

type PlayPhase = 'question' | 'feedback' | 'result'
type PlayStatus = 'loading' | 'ready' | 'notFound' | 'changed' | 'failed'

type PlayOption = { text: string; imageUrl: string | null; index: number }
type PlayQuestionView = { text: string; imageUrl: string | null; selectCount: number; options: PlayOption[] }

const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409

// Состояние прохождения живёт только во вкладке; ответы на сервере не хранятся.
// Правильные ответы появляются в `correct` лишь после check и только у викторины с showAnswers
export const usePlayStore = defineStore('play', () => {
  const token = ref('')
  const title = ref('')
  const showAnswers = ref(false)
  const version = ref('')
  const questions = ref<PlayQuestionView[]>([])
  const current = ref(0)
  const selected = ref<number[]>([])
  // Индекс — номер вопроса у учителя, значение — исходные номера отмеченных вариантов
  const answers = ref<number[][]>([])
  const correct = ref<number[]>([])
  const phase = ref<PlayPhase>('question')
  const result = ref<QuizResult | null>(null)
  const status = ref<PlayStatus>('loading')
  const busy = ref(false)
  let retryAction: (() => Promise<void>) | null = null
  // Растёт при каждом старте: ответ запроса из прошлого прохождения уже не нужен
  let epoch = 0

  const question = computed(() => questions.value[current.value] ?? null)
  const isLast = computed(() => current.value === questions.value.length - 1)
  const canSubmit = computed(() => question.value !== null && selected.value.length === question.value.selectCount && !busy.value)

  // Только в фазе feedback, когда check уже вернул правильные варианты
  const feedback = computed<'correct' | 'partial' | 'wrong' | null>(() => {
    if (phase.value !== 'feedback' || question.value === null) return null
    const hits = selected.value.filter((index) => correct.value.includes(index)).length
    if (hits === 0) return 'wrong'
    return hits === correct.value.length && selected.value.length === correct.value.length ? 'correct' : 'partial'
  })

  function isSelected(index: number): boolean {
    return selected.value.includes(index)
  }

  // Полный выбор блокирует остальные варианты, снять отметку можно всегда
  function isDisabled(index: number): boolean {
    if (phase.value !== 'question' || busy.value) return true
    if (question.value === null || isSelected(index)) return false
    return selected.value.length >= question.value.selectCount
  }

  function toggle(index: number): void {
    if (isDisabled(index)) return
    selected.value = isSelected(index) ? selected.value.filter((value) => value !== index) : [...selected.value, index]
  }

  // Сбой загрузки повторяется полным стартом (retryAction = null), остальные — тем же запросом
  function fail(error: unknown, retryWith: (() => Promise<void>) | null): void {
    if (error instanceof ApiError && error.status === NOT_FOUND_STATUS) {
      status.value = 'notFound'
      return
    }
    if (error instanceof ApiError && error.status === CONFLICT_STATUS) {
      status.value = 'changed'
      return
    }
    retryAction = retryWith
    status.value = 'failed'
  }

  async function run(action: () => Promise<void>, pending: PlayStatus = 'ready'): Promise<void> {
    const startedAt = epoch
    busy.value = true
    status.value = pending
    try {
      await action()
      if (startedAt === epoch) status.value = 'ready'
    } catch (error) {
      if (startedAt === epoch) fail(error, pending === 'loading' ? null : action)
    } finally {
      if (startedAt === epoch) busy.value = false
    }
  }

  function reset(): void {
    epoch += 1
    current.value = 0
    selected.value = []
    answers.value = []
    correct.value = []
    phase.value = 'question'
    result.value = null
    questions.value = []
    retryAction = null
  }

  async function start(newToken?: string, random: () => number = Math.random): Promise<void> {
    if (newToken !== undefined) token.value = newToken
    reset()
    if (!shareTokenSchema.safeParse(token.value).success) {
      status.value = 'notFound'
      return
    }
    const startedAt = epoch
    await run(async () => {
      const { quiz } = await playApi.get(token.value)
      if (startedAt !== epoch) return
      title.value = quiz.title
      showAnswers.value = quiz.showAnswers
      version.value = quiz.version
      questions.value = quiz.questions.map((item) => ({
        text: item.text,
        imageUrl: item.imageUrl,
        selectCount: item.selectCount,
        options: shuffle(item.options, random).map(({ item: option, index }) => ({ text: option.text, imageUrl: option.imageUrl, index })),
      }))
      answers.value = quiz.questions.map(() => [])
    }, 'loading')
  }

  async function finish(): Promise<void> {
    const startedAt = epoch
    const response = await playApi.finish(token.value, { version: version.value, answers: answers.value })
    if (startedAt !== epoch) return
    result.value = response.result
    phase.value = 'result'
  }

  function goNext(): Promise<void> {
    if (isLast.value) return finish()
    current.value += 1
    selected.value = []
    correct.value = []
    phase.value = 'question'
    return Promise.resolve()
  }

  async function submit(): Promise<void> {
    if (!canSubmit.value) return
    const index = current.value
    const chosen = [...selected.value]
    answers.value[index] = chosen
    if (!showAnswers.value) {
      await run(goNext)
      return
    }
    const startedAt = epoch
    await run(async () => {
      const response = await playApi.check(token.value, { version: version.value, questionIndex: index, selected: chosen })
      if (startedAt !== epoch) return
      correct.value = response.correct
      phase.value = 'feedback'
    })
  }

  async function next(): Promise<void> {
    if (busy.value || phase.value !== 'feedback') return
    await run(goNext)
  }

  async function retry(): Promise<void> {
    if (busy.value) return
    const action = retryAction
    if (action === null) return start()
    await run(action)
  }

  return {
    title, showAnswers, questions, current, selected, answers, correct, phase, result, status, busy,
    question, isLast, canSubmit, feedback,
    isSelected, isDisabled, toggle, start, submit, next, retry,
  }
})
