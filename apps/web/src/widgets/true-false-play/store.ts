import { shareTokenSchema, type QuizTimer } from '@nataskium/shared/schemas'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { playApi, type QuizResult } from '@/entities/quiz'
import { trueFalsePlayApi, type PlayTrueFalseFinishResponse, type PlayTrueFalseResponse } from '@/entities/true-false'
import { ApiError } from '@/shared'
import type { TrueFalsePhase, TrueFalseStatus } from './types'

type Review = NonNullable<PlayTrueFalseFinishResponse['review']>

const MS_PER_SECOND = 1000
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409
// Пауза, чтобы ученик успел увидеть подсветку ответа, прежде чем покажется следующее утверждение
export const ANSWER_FEEDBACK_MS = 1200
export const ANSWER_ADVANCE_MS = 500

// Прохождение живёт только во вкладке; ответы на сервере не хранятся.
// Правильный ответ приходит лишь после check (только вердикт) и в review итога, и только при showAnswers
export const useTrueFalsePlayStore = defineStore('true-false-play', () => {
  const token = ref('')
  const title = ref('')
  const showAnswers = ref(false)
  const version = ref('')
  const timer = ref<QuizTimer>({ mode: 'none' })
  const statements = ref<string[]>([])
  // Первое неотвеченное утверждение; viewing — просматриваемое (может быть раньше current)
  const current = ref(0)
  const viewing = ref(0)
  // answers[i] — ответ на утверждение i, null — не отвечено
  const answers = ref<(boolean | null)[]>([])
  // Вердикты только те, что пришли от сервера через check
  const verdicts = ref<(boolean | null)[]>([])
  // Ответ принят, идёт пауза до автоперехода
  const advancing = ref(false)
  const phase = ref<TrueFalsePhase>('question')
  const status = ref<TrueFalseStatus>('loading')
  const busy = ref(false)
  const result = ref<QuizResult | null>(null)
  const review = ref<Review | null>(null)
  // Метка Date.now() показа первого утверждения: отсчёт идёт по ней, а не по счётчику секунд
  const startedAt = ref<number | null>(null)
  const timedOut = ref(false)
  const elapsedSeconds = ref<number | null>(null)
  let retryAction: (() => Promise<void>) | null = null
  // Растёт при каждом старте: ответ запроса из прошлого прохождения уже не нужен
  let epoch = 0
  // Последний запрос: expire ждёт его, чтобы finish не обогнал check
  let inflight: Promise<void> = Promise.resolve()
  // Обычный finish уже идёт: истечение времени его не заменяет и «Время вышло» не ставит
  let finishing = false
  let advanceTimer: ReturnType<typeof setTimeout> | null = null

  const statement = computed(() => statements.value[viewing.value] ?? null)
  const verdict = computed(() => verdicts.value[viewing.value] ?? null)
  const isLast = computed(() => current.value === statements.value.length - 1)
  const canAnswer = computed(
    () =>
      phase.value === 'question' &&
      statement.value !== null &&
      viewing.value === current.value &&
      !busy.value &&
      !advancing.value &&
      !timedOut.value &&
      status.value === 'ready',
  )
  const canNavigate = computed(() => phase.value === 'question' && !busy.value && !advancing.value && status.value === 'ready')
  const canPrev = computed(() => canNavigate.value && viewing.value > 0)
  const canForward = computed(() => canNavigate.value && viewing.value < current.value)

  function clearAdvance(): void {
    if (advanceTimer !== null) clearTimeout(advanceTimer)
    advanceTimer = null
    advancing.value = false
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

  async function execute(action: () => Promise<void>, pending: TrueFalseStatus = 'ready'): Promise<void> {
    const runEpoch = epoch
    busy.value = true
    status.value = pending
    try {
      await action()
      if (runEpoch === epoch) status.value = 'ready'
    } catch (error) {
      if (runEpoch === epoch) fail(error, pending === 'loading' ? null : action)
    } finally {
      if (runEpoch === epoch) busy.value = false
    }
  }

  function run(action: () => Promise<void>, pending: TrueFalseStatus = 'ready'): Promise<void> {
    const task = execute(action, pending)
    inflight = task
    return task
  }

  function reset(): void {
    epoch += 1
    clearAdvance()
    title.value = ''
    statements.value = []
    current.value = 0
    viewing.value = 0
    answers.value = []
    verdicts.value = []
    phase.value = 'question'
    result.value = null
    review.value = null
    timer.value = { mode: 'none' }
    startedAt.value = null
    timedOut.value = false
    elapsedSeconds.value = null
    finishing = false
    retryAction = null
  }

  // initial — ответ GET, уже полученный PlayPage: первый показ без второго запроса.
  // «Пройти ещё раз», повтор и смена версии загружают задание заново (initial не передаётся)
  async function start(newToken?: string, initial?: PlayTrueFalseResponse): Promise<void> {
    if (newToken !== undefined) token.value = newToken
    reset()
    if (!shareTokenSchema.safeParse(token.value).success) {
      status.value = 'notFound'
      return
    }
    const runEpoch = epoch
    await run(async () => {
      const response = initial ?? (await playApi.get(token.value))
      if (runEpoch !== epoch) return
      // По ссылке теперь другой тип задания — для этой игры его нет
      if (response.type !== 'truefalse') throw new ApiError(NOT_FOUND_STATUS)
      const { trueFalse } = response
      title.value = trueFalse.title
      showAnswers.value = trueFalse.showAnswers
      version.value = trueFalse.version
      timer.value = trueFalse.timer
      statements.value = trueFalse.statements
      answers.value = trueFalse.statements.map(() => null)
      verdicts.value = trueFalse.statements.map(() => null)
      startedAt.value = Date.now()
    }, 'loading')
  }

  async function finish(): Promise<void> {
    const runEpoch = epoch
    finishing = true
    try {
      const response = await trueFalsePlayApi.finish(token.value, { version: version.value, answers: answers.value })
      if (runEpoch !== epoch) return
      elapsedSeconds.value = startedAt.value === null ? null : Math.floor((Date.now() - startedAt.value) / MS_PER_SECOND)
      result.value = response.result
      review.value = response.review ?? null
      phase.value = 'result'
    } finally {
      if (runEpoch === epoch) finishing = false
    }
  }

  function advance(): void {
    advancing.value = false
    advanceTimer = null
    if (isLast.value) {
      void run(finish)
      return
    }
    current.value += 1
    viewing.value = current.value
  }

  function scheduleAdvance(delayMs: number): void {
    advancing.value = true
    advanceTimer = setTimeout(advance, delayMs)
  }

  async function answer(value: boolean): Promise<void> {
    if (!canAnswer.value) return
    const index = current.value
    answers.value = answers.value.map((existing, position) => (position === index ? value : existing))
    if (!showAnswers.value) {
      scheduleAdvance(ANSWER_ADVANCE_MS)
      return
    }
    const runEpoch = epoch
    await run(async () => {
      const response = await trueFalsePlayApi.check(token.value, { version: version.value, index, answer: value })
      if (runEpoch !== epoch || timedOut.value) return
      verdicts.value = verdicts.value.map((existing, position) => (position === index ? response.correct : existing))
      scheduleAdvance(ANSWER_FEEDBACK_MS)
    })
  }

  function prev(): void {
    if (canPrev.value) viewing.value -= 1
  }

  function forward(): void {
    if (canForward.value) viewing.value += 1
  }

  // Уход со страницы: отложенный переход и поздние ответы запросов больше не нужны
  function dispose(): void {
    reset()
  }

  // Ответ, не дошедший до check к концу времени, остаётся в answers: сервер всё равно оценит его при finish
  async function expire(): Promise<void> {
    if (phase.value === 'result' || timedOut.value || finishing) return
    timedOut.value = true
    clearAdvance()
    const runEpoch = epoch
    await inflight
    // TS сужает phase по проверке до await, а за время ожидания finish мог перевести её в result
    if (runEpoch !== epoch || (phase.value as TrueFalsePhase) === 'result') return
    await run(finish)
  }

  async function retry(): Promise<void> {
    if (busy.value) return
    if (timedOut.value && phase.value !== 'result') return run(finish)
    const action = retryAction
    if (action === null) return start()
    await run(action)
  }

  return {
    token, title, showAnswers, timer, statements, current, viewing, answers, verdict, verdicts, advancing, phase, status, busy, result, review,
    startedAt, timedOut, elapsedSeconds,
    statement, isLast, canAnswer, canPrev, canForward,
    start, answer, prev, forward, expire, retry, dispose,
  }
})
