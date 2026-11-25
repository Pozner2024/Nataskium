import type { QuizTimer } from '@nataskium/shared/schemas'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { playApi, type PlayQuizResponse, type QuizResult } from '@/entities/quiz'
import { ApiError, isPlaySourceValid, type PlaySource } from '@/shared'
import { shuffle } from './shuffle'

type PlayPhase = 'question' | 'feedback' | 'result'
type PlayStatus = 'loading' | 'ready' | 'notFound' | 'changed' | 'failed'

type PlayOption = { text: string; imageUrl: string | null; index: number }
type PlayQuestionView = { text: string; imageUrl: string | null; selectCount: number; options: PlayOption[] }

const MS_PER_SECOND = 1000
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409
// Как в «да/нет»: после подсветки ответа следующий вопрос появляется сам, без кнопок «Ответить» и «Дальше»
export const ANSWER_FEEDBACK_MS = 1200
export const ANSWER_ADVANCE_MS = 500

// Состояние прохождения живёт только во вкладке; ответы на сервере не хранятся.
// Правильные ответы появляются в `correct` лишь после check и только у викторины с showAnswers
export const usePlayStore = defineStore('play', () => {
  // null — адрес не разобран (мусорный slug библиотеки): «не найдено» без запроса
  const source = ref<PlaySource | null>(null)
  const title = ref('')
  const showAnswers = ref(false)
  const version = ref('')
  const questions = ref<PlayQuestionView[]>([])
  // current — первый неотвеченный вопрос, viewing — просматриваемый (может быть раньше current)
  const current = ref(0)
  const viewing = ref(0)
  const selected = ref<number[]>([])
  // Индекс — номер вопроса у учителя, значение — исходные номера отмеченных вариантов
  const answers = ref<number[][]>([])
  const correct = ref<number[]>([])
  // Правильные варианты, уже полученные от сервера через check; null — check не было
  const checked = ref<(number[] | null)[]>([])
  const phase = ref<PlayPhase>('question')
  const result = ref<QuizResult | null>(null)
  const status = ref<PlayStatus>('loading')
  const busy = ref(false)
  // Ответ засчитан, ждём автоперехода к следующему вопросу
  const advancing = ref(false)
  let advanceTimer: ReturnType<typeof setTimeout> | null = null
  const timer = ref<QuizTimer>({ mode: 'none' })
  // Метка Date.now() показа первого вопроса: отсчёт идёт по ней, а не по счётчику секунд
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

  const question = computed(() => questions.value[viewing.value] ?? null)
  const reviewing = computed(() => viewing.value !== current.value)
  const isLast = computed(() => current.value === questions.value.length - 1)
  const canSubmit = computed(
    () =>
      question.value !== null &&
      !reviewing.value &&
      !timedOut.value &&
      !advancing.value &&
      selected.value.length === question.value.selectCount &&
      !busy.value,
  )

  // Только в фазе feedback, когда check уже вернул правильные варианты
  const feedback = computed<'correct' | 'partial' | 'wrong' | null>(() => {
    if (phase.value !== 'feedback' || reviewing.value || question.value === null) return null
    const hits = selected.value.filter((index) => correct.value.includes(index)).length
    if (hits === 0) return 'wrong'
    return hits === correct.value.length && selected.value.length === correct.value.length ? 'correct' : 'partial'
  })

  // Правильные варианты просматриваемого вопроса: те, что ученик уже видел, без новых запросов
  const viewCorrect = computed<number[] | null>(() => {
    if (reviewing.value) return checked.value[viewing.value] ?? null
    return phase.value === 'feedback' ? correct.value : null
  })

  const canNavigate = computed(() => phase.value !== 'result' && status.value === 'ready' && !busy.value && !timedOut.value && !advancing.value)
  const canPrev = computed(() => canNavigate.value && viewing.value > 0)
  const canForward = computed(() => canNavigate.value && viewing.value < current.value)

  function isSelected(index: number): boolean {
    if (reviewing.value) return answers.value[viewing.value]?.includes(index) ?? false
    return selected.value.includes(index)
  }

  // Полный выбор блокирует остальные варианты, снять отметку можно всегда.
  // При одном ответе блокировки нет: клик по другому варианту заменяет выбор, как у радиокнопок
  function isDisabled(index: number): boolean {
    if (reviewing.value || phase.value !== 'question' || busy.value || timedOut.value || advancing.value) return true
    if (question.value === null || isSelected(index) || question.value.selectCount === 1) return false
    return selected.value.length >= question.value.selectCount
  }

  function toggle(index: number): void {
    if (isDisabled(index)) return
    if (isSelected(index)) {
      selected.value = selected.value.filter((value) => value !== index)
      return
    }
    selected.value = question.value?.selectCount === 1 ? [index] : [...selected.value, index]
    // Выбрано столько вариантов, сколько нужно, — ответ засчитывается сразу
    if (canSubmit.value) void submit()
  }

  // Окно «Как играть» открыли во время подсветки ответа: переход ждёт закрытия окна, ответ под окном не сменится
  let advanceHeld = false

  function clearAdvance(): void {
    if (advanceTimer !== null) clearTimeout(advanceTimer)
    advanceTimer = null
    advanceHeld = false
    advancing.value = false
  }

  function scheduleAdvance(delayMs: number): void {
    advancing.value = true
    if (paused) {
      advanceHeld = true
      return
    }
    advanceTimer = setTimeout(() => {
      advancing.value = false
      advanceTimer = null
      void run(goNext)
    }, delayMs)
  }

  // Проверка и итог идут только после успешной загрузки, когда источник уже проверен в start
  function activeSource(): PlaySource {
    if (source.value === null) throw new ApiError(NOT_FOUND_STATUS)
    return source.value
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

  async function execute(action: () => Promise<void>, pending: PlayStatus = 'ready'): Promise<void> {
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

  function run(action: () => Promise<void>, pending: PlayStatus = 'ready'): Promise<void> {
    const task = execute(action, pending)
    inflight = task
    return task
  }

  function reset(): void {
    clearAdvance()
    epoch += 1
    current.value = 0
    viewing.value = 0
    selected.value = []
    answers.value = []
    correct.value = []
    checked.value = []
    phase.value = 'question'
    result.value = null
    questions.value = []
    timer.value = { mode: 'none' }
    startedAt.value = null
    clockHeld.value = false
    pausedElapsedMs = null
    paused = false
    timedOut.value = false
    elapsedSeconds.value = null
    finishing = false
    retryAction = null
  }

  // initial — ответ GET, уже полученный PlayPage: первый показ без второго запроса.
  // «Пройти ещё раз», повтор и смена версии загружают задание заново (initial не передаётся)
  async function start(newSource?: PlaySource | null, random: () => number = Math.random, initial?: PlayQuizResponse): Promise<void> {
    if (newSource !== undefined) source.value = newSource
    reset()
    const loadFrom = source.value
    if (!isPlaySourceValid(loadFrom)) {
      status.value = 'notFound'
      return
    }
    const runEpoch = epoch
    await run(async () => {
      const response = initial ?? (await playApi.get(loadFrom))
      if (runEpoch !== epoch) return
      // Тип выбирает PlayPage. Сюда другой тип попадает только при собственном запросе стора: для викторины
      // такой ссылки нет — как отсутствующее задание
      if (response.type !== 'quiz') throw new ApiError(NOT_FOUND_STATUS)
      const { quiz } = response
      title.value = quiz.title
      showAnswers.value = quiz.showAnswers
      version.value = quiz.version
      timer.value = quiz.timer
      questions.value = quiz.questions.map((item) => ({
        text: item.text,
        imageUrl: item.imageUrl,
        selectCount: item.selectCount,
        options: shuffle(item.options, random).map(({ item: option, index }) => ({ text: option.text, imageUrl: option.imageUrl, index })),
      }))
      answers.value = quiz.questions.map(() => [])
      checked.value = quiz.questions.map(() => null)
      startedAt.value = Date.now()
    }, 'loading')
  }

  // Уход со страницы игры: следующий показ начинается с загрузки и снова получает интро и вылет (ADR 0015)
  function dispose(): void {
    reset()
    status.value = 'loading'
  }

  // Вылет первого задания (тема интро) не съедает время: пока оно вылетает, таймер стоит на полном лимите,
  // отсчёт начинается с приземления (ADR 0015)
  const clockHeld = ref(false)

  function holdClock(): void {
    if (startedAt.value === null) return
    startedAt.value = null
    clockHeld.value = true
  }

  // Пауза на время окна «Как играть»: прошедшее время замирает, после паузы отсчёт продолжается с него.
  // Окно могут открыть и во время вылета вопроса: тогда отсчёт начнётся только после закрытия
  let paused = false
  let pausedElapsedMs: number | null = null

  // Окно «Как играть» могли открыть, пока finish в полёте: тогда время берётся с момента паузы
  function elapsedAtFinish(): number | null {
    if (startedAt.value !== null) return Math.floor((Date.now() - startedAt.value) / MS_PER_SECOND)
    return pausedElapsedMs === null ? null : Math.floor(pausedElapsedMs / MS_PER_SECOND)
  }

  function holdAdvance(): void {
    if (advanceTimer === null) return
    clearTimeout(advanceTimer)
    advanceTimer = null
    advanceHeld = true
  }

  // После закрытия окна подсветка видна ещё коротко, затем переход
  function releaseAdvance(): void {
    if (!advanceHeld) return
    advanceHeld = false
    scheduleAdvance(ANSWER_ADVANCE_MS)
  }

  function pauseClock(): void {
    if (paused || phase.value === 'result') return
    paused = true
    holdAdvance()
    if (startedAt.value === null) return
    pausedElapsedMs = Date.now() - startedAt.value
    elapsedSeconds.value = Math.floor(pausedElapsedMs / MS_PER_SECOND)
    startedAt.value = null
  }

  function resumeClock(): void {
    if (!paused) return
    paused = false
    releaseAdvance()
    if (pausedElapsedMs === null) return
    if (!(phase.value === 'result')) {
      startedAt.value = Date.now() - pausedElapsedMs
      elapsedSeconds.value = null
    }
    pausedElapsedMs = null
  }

  function restartClock(): void {
    if (startedAt.value === null && !clockHeld.value) return
    if (paused) {
      pausedElapsedMs = 0
      clockHeld.value = false
      return
    }
    startedAt.value = Date.now()
    clockHeld.value = false
  }

  async function finish(): Promise<void> {
    const runEpoch = epoch
    finishing = true
    try {
      const response = await playApi.finish(activeSource(), { version: version.value, answers: answers.value })
      if (runEpoch !== epoch) return
      elapsedSeconds.value = elapsedAtFinish()
      result.value = response.result
      phase.value = 'result'
    } finally {
      if (runEpoch === epoch) finishing = false
    }
  }

  function goNext(): Promise<void> {
    if (isLast.value) return finish()
    current.value += 1
    viewing.value = current.value
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
      scheduleAdvance(ANSWER_ADVANCE_MS)
      return
    }
    const runEpoch = epoch
    await run(async () => {
      const response = await playApi.check(activeSource(), { version: version.value, questionIndex: index, selected: chosen })
      if (runEpoch !== epoch) return
      if (timedOut.value) return
      correct.value = response.correct
      checked.value[index] = response.correct
      phase.value = 'feedback'
      scheduleAdvance(ANSWER_FEEDBACK_MS)
    })
  }

  async function next(): Promise<void> {
    if (busy.value || reviewing.value || phase.value !== 'feedback') return
    clearAdvance()
    await run(goNext)
  }

  function prev(): void {
    if (canPrev.value) viewing.value -= 1
  }

  function forward(): void {
    if (canForward.value) viewing.value += 1
  }

  // Выбор, не отправленный к концу времени, не засчитывается: в answers он так и остаётся пустым
  async function expire(): Promise<void> {
    if (phase.value === 'result' || timedOut.value || finishing) return
    timedOut.value = true
    clearAdvance()
    if (phase.value === 'question') selected.value = []
    const runEpoch = epoch
    await inflight
    // TS сужает phase по проверке до await, а за время ожидания finish мог перевести её в result
    if (runEpoch !== epoch || (phase.value as PlayPhase) === 'result') return
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
    timer, startedAt, timedOut, elapsedSeconds,
    title, showAnswers, questions, current, viewing, selected, answers, correct, phase, result, status, busy, advancing,
    question, isLast, canSubmit, feedback, reviewing, viewCorrect, canPrev, canForward,
    isSelected, isDisabled, toggle, start, submit, next, prev, forward, retry, expire, holdClock, restartClock, pauseClock, resumeClock, dispose,
  }
})
