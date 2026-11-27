import type { QuizTimer } from '@nataskium/shared/schemas'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { matchingPlayApi, type PlayMatchingFinishResponse, type PlayMatchingResponse } from '@/entities/matching'
import { playApi, type QuizResult } from '@/entities/quiz'
import { ApiError, isPlaySourceValid, type PlaySource } from '@/shared'
import type { MatchingStatus, PlaceOutcome } from './types'

type MatchingPhase = 'play' | 'result'
type Review = NonNullable<PlayMatchingFinishResponse['review']>

const MS_PER_SECOND = 1000
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409

// Прохождение живёт только во вкладке; ответы на сервере не хранятся.
// Слова перемешивает сервер, определения идут в порядке учителя: номер определения — его индекс
export const useMatchingPlayStore = defineStore('matching-play', () => {
  // null — адрес не разобран (мусорный slug библиотеки): «не найдено» без запроса
  const source = ref<PlaySource | null>(null)
  const title = ref('')
  const showAnswers = ref(false)
  const version = ref('')
  const timer = ref<QuizTimer>({ mode: 'none' })
  const definitions = ref<string[]>([])
  const terms = ref<string[]>([])
  // placements[i] — индекс слова в terms, поставленного к определению i; null — пусто
  const placements = ref<(number | null)[]>([])
  // Слово, выбранное тапом или клавиатурой (запасной путь)
  const picked = ref<number | null>(null)
  const phase = ref<MatchingPhase>('play')
  const status = ref<MatchingStatus>('loading')
  const busy = ref(false)
  const result = ref<QuizResult | null>(null)
  const review = ref<Review | null>(null)
  // Метка Date.now() показа задания: отсчёт идёт по ней, а не по счётчику секунд
  const startedAt = ref<number | null>(null)
  const timedOut = ref(false)
  const elapsedSeconds = ref<number | null>(null)
  let retryAction: (() => Promise<void>) | null = null
  // Растёт при каждом старте: ответ запроса из прошлого прохождения уже не нужен
  let epoch = 0
  // «Проверить» уже отправлено: истечение времени его не заменяет и «Время вышло» не ставит
  let finishing = false

  const pool = computed(() => terms.value.map((_, index) => index).filter((index) => !placements.value.includes(index)))
  const placedCount = computed(() => placements.value.filter((term) => term !== null).length)
  const isComplete = computed(() => terms.value.length > 0 && pool.value.length === 0)
  const isLocked = computed(() => phase.value !== 'play' || busy.value || timedOut.value || status.value !== 'ready')
  const canCheck = computed(() => isComplete.value && !isLocked.value)

  function definitionOf(term: number): number | null {
    const index = placements.value.indexOf(term)
    return index === -1 ? null : index
  }

  function pick(term: number): void {
    if (isLocked.value || terms.value[term] === undefined) return
    picked.value = picked.value === term ? null : term
  }

  function cancelPick(): void {
    picked.value = null
  }

  // Одно слово — максимум у одного определения: иначе сервер отклонит ответ. На занятом определении
  // старое слово возвращается к словам, обмена местами нет
  function place(term: number, definition: number): PlaceOutcome | null {
    if (isLocked.value || terms.value[term] === undefined || definitions.value[definition] === undefined) return null
    picked.value = null
    const from = definitionOf(term)
    if (from === definition) return null
    const replaced = placements.value[definition] ?? null
    const next = [...placements.value]
    if (from !== null) next[from] = null
    next[definition] = term
    placements.value = next
    return { replaced }
  }

  function unplace(definition: number): number | null {
    if (isLocked.value) return null
    const term = placements.value[definition] ?? null
    if (term === null) return null
    placements.value = placements.value.map((value, index) => (index === definition ? null : value))
    if (picked.value === term) picked.value = null
    return term
  }

  // Проверка и итог идут только после успешной загрузки, когда источник уже проверен в start
  function activeSource(): PlaySource {
    if (source.value === null) throw new ApiError(NOT_FOUND_STATUS)
    return source.value
  }

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

  // Сбой загрузки повторяется полным стартом (retryAction = null), сбой проверки — тем же запросом
  async function run(action: () => Promise<void>, pending: MatchingStatus = 'ready'): Promise<void> {
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

  function reset(): void {
    epoch += 1
    busy.value = false
    title.value = ''
    definitions.value = []
    terms.value = []
    placements.value = []
    picked.value = null
    phase.value = 'play'
    result.value = null
    review.value = null
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
  // «Пройти ещё раз», повтор и смена версии загружают задание заново — сервер перемешивает слова снова
  async function start(newSource?: PlaySource | null, initial?: PlayMatchingResponse): Promise<void> {
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
      // По ссылке теперь другой тип задания — для этой игры его нет
      if (response.type !== 'matching') throw new ApiError(NOT_FOUND_STATUS)
      const { matching } = response
      title.value = matching.title
      showAnswers.value = matching.showAnswers
      version.value = matching.version
      timer.value = matching.timer
      definitions.value = matching.definitions
      terms.value = matching.terms
      placements.value = matching.definitions.map(() => null)
      startedAt.value = Date.now()
    }, 'loading')
  }

  function answers(): (string | null)[] {
    return placements.value.map((term) => (term === null ? null : (terms.value[term] ?? null)))
  }

  // Расстановка после проверки остаётся: из неё итог берёт «Ваш ответ»
  async function finish(): Promise<void> {
    const runEpoch = epoch
    finishing = true
    try {
      const response = await matchingPlayApi.finish(activeSource(), { version: version.value, answers: answers() })
      if (runEpoch !== epoch) return
      elapsedSeconds.value = elapsedAtFinish()
      result.value = response.result
      review.value = response.review ?? null
      phase.value = 'result'
    } finally {
      if (runEpoch === epoch) finishing = false
    }
  }

  async function check(): Promise<void> {
    if (!canCheck.value) return
    await run(finish)
  }

  // Пустые определения уходят как null — 0 баллов за них (ADR-0012)
  async function expire(): Promise<void> {
    if (phase.value === 'result' || timedOut.value || finishing) return
    timedOut.value = true
    picked.value = null
    await run(finish)
  }

  async function retry(): Promise<void> {
    if (busy.value) return
    const action = retryAction
    if (action === null) return start()
    await run(action)
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

  function pauseClock(): void {
    if (paused || phase.value === 'result') return
    paused = true
    if (startedAt.value === null) return
    pausedElapsedMs = Date.now() - startedAt.value
    elapsedSeconds.value = Math.floor(pausedElapsedMs / MS_PER_SECOND)
    startedAt.value = null
  }

  function resumeClock(): void {
    if (!paused) return
    paused = false
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

  return {
    source, title, showAnswers, timer, definitions, terms, placements, picked, phase, status, busy, result, review,
    startedAt, timedOut, elapsedSeconds,
    pool, placedCount, isComplete, isLocked, canCheck,
    definitionOf, pick, cancelPick, place, unplace, start, check, expire, retry, holdClock, restartClock, pauseClock, resumeClock, dispose,
  }
})
