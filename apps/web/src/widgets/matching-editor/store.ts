import { MAX_MATCHING_PAIRS, matchingInputSchema, matchingKey, MIN_MATCHING_PAIRS } from '@nataskium/shared/schemas'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { matchingApi, newMatching, newPair, type MatchingInput, type MatchingResponse } from '@/entities/matching'
import { authorizedRequest } from '@/features/auth'
import { ApiError } from '@/shared'

export type EditorView = 'pairs' | 'settings'
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'notFound' | 'error'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'invalid' | 'limitReached' | 'failed'
export type PairField = 'term' | 'definition'

const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409
const DUPLICATE_MESSAGE = 'Duplicate text'

// Ключ ошибки — путь из схемы через точку: `title`, `pairs`, `pairs.0.term`.
// Дубль схема отмечает только у второй пары; partner — номер (с 1) другой пары с тем же текстом
export type FieldError = { message: string; partner?: number }

function cloneMatching(matching: MatchingInput): MatchingInput {
  return JSON.parse(JSON.stringify(matching)) as MatchingInput
}

function issuesToFieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, FieldError> {
  const errors: Record<string, FieldError> = {}
  for (const issue of issues) {
    const key = issue.path.map(String).join('.')
    errors[key] ??= { message: issue.message }
  }
  return errors
}

// Дубль подсвечивается в обеих парах: каждая ссылается на первую другую пару с тем же текстом
function markDuplicatePairs(pairs: MatchingInput['pairs'], errors: Record<string, FieldError>): Record<string, FieldError> {
  const result = { ...errors }
  for (const field of ['term', 'definition'] as const) {
    const byKey = new Map<string, number[]>()
    pairs.forEach((pair, index) => {
      const key = matchingKey(pair[field])
      if (key === '') return
      byKey.set(key, [...(byKey.get(key) ?? []), index])
    })
    for (const indexes of byKey.values()) {
      if (indexes.length < 2) continue
      for (const index of indexes) {
        const partner = indexes.find((other) => other !== index) ?? index
        const path = `pairs.${index}.${field}`
        if (result[path] && result[path].message !== DUPLICATE_MESSAGE) continue
        result[path] = { message: DUPLICATE_MESSAGE, partner: partner + 1 }
      }
    }
  }
  return result
}

function toMatchingInput(matching: MatchingResponse['matching']): MatchingInput {
  return {
    title: matching.title,
    showAnswers: matching.showAnswers,
    gradingScale: matching.gradingScale,
    group: matching.group,
    timer: matching.timer,
    introTheme: matching.introTheme,
    pairs: matching.pairs.map((pair) => ({ term: pair.term, definition: pair.definition })),
  }
}

// Snapshot — в той же форме, что сравнивает isDirty: после схемы (trim, порядок полей)
function snapshotOf(matching: MatchingInput): string {
  const parsed = matchingInputSchema.safeParse(matching)
  return JSON.stringify(parsed.success ? parsed.data : matching)
}

// Состояние редактора сопоставления. Токен берёт authorizedRequest; навигацию после создания делает виджет
export const useMatchingEditorStore = defineStore('matching-editor', () => {
  const matching = ref<MatchingInput>(newMatching())
  const id = ref<string | null>(null)
  const shareToken = ref<string | null>(null)
  const view = ref<EditorView>('pairs')
  const loadStatus = ref<LoadStatus>('idle')
  const saveStatus = ref<SaveStatus>('idle')
  const fieldErrors = ref<Record<string, FieldError>>({})
  // Создание → переход на /teacher/matching/<id>: старая страница не должна сбросить состояние при размонтировании
  const handoverId = ref<string | null>(null)
  // Растёт при reset: ответ load, начатого до сброса, уже не нужен
  let epoch = 0
  const savedSnapshot = ref(JSON.stringify(matching.value))

  const isDirty = computed(() => snapshotOf(matching.value) !== savedSnapshot.value)
  const canAddPair = computed(() => matching.value.pairs.length < MAX_MATCHING_PAIRS)
  const canRemovePair = computed(() => matching.value.pairs.length > MIN_MATCHING_PAIRS)
  // Номера пар (с 1) с ошибками — для сводки над кнопками
  const invalidPairs = computed(() => {
    const numbers = new Set<number>()
    for (const key of Object.keys(fieldErrors.value)) {
      const [scope, index] = key.split('.')
      if (scope === 'pairs' && index !== undefined) numbers.add(Number(index) + 1)
    }
    return [...numbers].sort((a, b) => a - b)
  })

  function addPair(): void {
    if (!canAddPair.value) return
    matching.value.pairs.push(newPair())
  }

  // Пути ошибок привязаны к индексам: после удаления они указали бы на чужие пары
  function removePair(index: number): void {
    if (!canRemovePair.value) return
    matching.value.pairs.splice(index, 1)
    fieldErrors.value = {}
  }

  function errorOf(path: string): FieldError | undefined {
    return fieldErrors.value[path]
  }

  function apply(response: MatchingResponse): void {
    const input = toMatchingInput(response.matching)
    matching.value = input
    id.value = response.matching.id
    shareToken.value = response.matching.shareToken
    savedSnapshot.value = snapshotOf(input)
    loadStatus.value = 'ready'
  }

  async function load(matchingId: string): Promise<void> {
    loadStatus.value = 'loading'
    const startedEpoch = epoch
    try {
      const response = await authorizedRequest((accessToken) => matchingApi.get(matchingId, accessToken))
      if (startedEpoch !== epoch) return
      apply(response)
    } catch (error) {
      if (startedEpoch !== epoch) return
      loadStatus.value = error instanceof ApiError && error.status === NOT_FOUND_STATUS ? 'notFound' : 'error'
    }
  }

  // true — сохранено. Ошибки показываются у полей
  async function save(): Promise<boolean> {
    if (saveStatus.value === 'saving') return false
    const parsed = matchingInputSchema.safeParse(matching.value)
    if (!parsed.success) {
      showFieldErrors(issuesToFieldErrors(parsed.error.issues))
      return false
    }
    fieldErrors.value = {}
    saveStatus.value = 'saving'
    const startedEpoch = epoch
    const input = cloneMatching(parsed.data)
    try {
      const currentId = id.value
      const response = await authorizedRequest((accessToken) =>
        currentId === null ? matchingApi.create(input, accessToken) : matchingApi.update(currentId, input, accessToken),
      )
      if (startedEpoch !== epoch) return false
      id.value = response.matching.id
      shareToken.value = response.matching.shareToken
      savedSnapshot.value = JSON.stringify(input)
      loadStatus.value = 'ready'
      saveStatus.value = 'saved'
      return true
    } catch (error) {
      if (startedEpoch !== epoch) return false
      handleSaveError(error)
      return false
    }
  }

  function showFieldErrors(errors: Record<string, FieldError>): void {
    fieldErrors.value = markDuplicatePairs(matching.value.pairs, errors)
    saveStatus.value = 'invalid'
  }

  function handleSaveError(error: unknown): void {
    if (!(error instanceof ApiError)) {
      saveStatus.value = 'failed'
      return
    }
    if (error.status === CONFLICT_STATUS) saveStatus.value = 'limitReached'
    else if (error.status === BAD_REQUEST_STATUS && error.issues.length > 0) showFieldErrors(issuesToFieldErrors(error.issues))
    else saveStatus.value = 'failed'
  }

  function reset(): void {
    matching.value = newMatching()
    id.value = null
    shareToken.value = null
    view.value = 'pairs'
    loadStatus.value = 'idle'
    saveStatus.value = 'idle'
    fieldErrors.value = {}
    handoverId.value = null
    epoch++
    savedSnapshot.value = JSON.stringify(matching.value)
  }

  return {
    matching,
    id,
    shareToken,
    view,
    loadStatus,
    saveStatus,
    fieldErrors,
    isDirty,
    canAddPair,
    canRemovePair,
    invalidPairs,
    handoverId,
    addPair,
    removePair,
    errorOf,
    load,
    save,
    reset,
  }
})
