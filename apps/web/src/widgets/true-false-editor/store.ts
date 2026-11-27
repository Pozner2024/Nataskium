import { matchingKey, MAX_TRUE_FALSE_ITEMS, MIN_TRUE_FALSE_ITEMS, trueFalseInputSchema } from '@nataskium/shared/schemas'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { newItem, newTrueFalse, trueFalseApi, type TrueFalseDraft, type TrueFalseInput, type TrueFalseResponse } from '@/entities/true-false'
import { authorizedRequest } from '@/features/auth'
import { ApiError } from '@/shared'

export type EditorView = 'items' | 'settings'
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'notFound' | 'error'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'invalid' | 'limitReached' | 'failed'

const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409
const DUPLICATE_MESSAGE = 'Duplicate text'
// Метка store при пустом ответе; по ней issueText отличает её от прочих сообщений на .answer
export const ANSWER_REQUIRED_MESSAGE = 'Answer is required'

// Ключ ошибки — путь из схемы через точку: `title`, `items`, `items.0.statement`.
// Дубль схема отмечает только у второго утверждения; partner — номер (с 1) другого утверждения с тем же текстом
export type FieldError = { message: string; partner?: number }

function cloneTrueFalse(trueFalse: TrueFalseInput): TrueFalseInput {
  return JSON.parse(JSON.stringify(trueFalse)) as TrueFalseInput
}

function issuesToFieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, FieldError> {
  const errors: Record<string, FieldError> = {}
  for (const issue of issues) {
    const key = issue.path.map(String).join('.')
    errors[key] ??= { message: issue.message }
  }
  return errors
}

// Схема отвечает на null общим «ожидался boolean»: у поля ответа подставляем своё сообщение
function missingAnswerErrors(items: TrueFalseDraft['items']): Record<string, FieldError> {
  const errors: Record<string, FieldError> = {}
  items.forEach((item, index) => {
    if (item.answer === null) errors[`items.${index}.answer`] = { message: ANSWER_REQUIRED_MESSAGE }
  })
  return errors
}

// Дубль подсвечивается в обоих утверждениях: каждое ссылается на первое другое с тем же текстом
function markDuplicateItems(items: TrueFalseDraft['items'], errors: Record<string, FieldError>): Record<string, FieldError> {
  const result = { ...errors }
  const byKey = new Map<string, number[]>()
  items.forEach((item, index) => {
    const key = matchingKey(item.statement)
    if (key === '') return
    byKey.set(key, [...(byKey.get(key) ?? []), index])
  })
  for (const indexes of byKey.values()) {
    if (indexes.length < 2) continue
    for (const index of indexes) {
      const partner = indexes.find((other) => other !== index) ?? index
      const path = `items.${index}.statement`
      if (result[path] && result[path].message !== DUPLICATE_MESSAGE) continue
      result[path] = { message: DUPLICATE_MESSAGE, partner: partner + 1 }
    }
  }
  return result
}

function toTrueFalseDraft(trueFalse: TrueFalseResponse['trueFalse']): TrueFalseDraft {
  return {
    title: trueFalse.title,
    showAnswers: trueFalse.showAnswers,
    gradingScale: trueFalse.gradingScale,
    group: trueFalse.group,
    timer: trueFalse.timer,
    introTheme: trueFalse.introTheme,
    items: trueFalse.items.map((item) => ({ statement: item.statement, answer: item.answer })),
  }
}

// Snapshot — в той же форме, что сравнивает isDirty: после схемы (trim, порядок полей)
function snapshotOf(trueFalse: TrueFalseDraft): string {
  const parsed = trueFalseInputSchema.safeParse(trueFalse)
  return JSON.stringify(parsed.success ? parsed.data : trueFalse)
}

// Состояние редактора «да/нет». Токен берёт authorizedRequest; навигацию после создания делает виджет
export const useTrueFalseEditorStore = defineStore('true-false-editor', () => {
  const trueFalse = ref<TrueFalseDraft>(newTrueFalse())
  const id = ref<string | null>(null)
  const shareToken = ref<string | null>(null)
  const view = ref<EditorView>('items')
  const loadStatus = ref<LoadStatus>('idle')
  const saveStatus = ref<SaveStatus>('idle')
  const fieldErrors = ref<Record<string, FieldError>>({})
  // Создание → переход на /teacher/true-false/<id>: старая страница не должна сбросить состояние при размонтировании
  const handoverId = ref<string | null>(null)
  // Растёт при reset: ответ load, начатого до сброса, уже не нужен
  let epoch = 0
  const savedSnapshot = ref(JSON.stringify(trueFalse.value))

  const items = computed(() => trueFalse.value.items)
  const isDirty = computed(() => snapshotOf(trueFalse.value) !== savedSnapshot.value)
  const canAddItem = computed(() => items.value.length < MAX_TRUE_FALSE_ITEMS)
  const canRemoveItem = computed(() => items.value.length > MIN_TRUE_FALSE_ITEMS)
  // Номера утверждений (с 1) с ошибками — для сводки над кнопками
  const invalidItems = computed(() => {
    const numbers = new Set<number>()
    for (const key of Object.keys(fieldErrors.value)) {
      const [scope, index] = key.split('.')
      if (scope === 'items' && index !== undefined) numbers.add(Number(index) + 1)
    }
    return [...numbers].sort((a, b) => a - b)
  })

  function addItem(): void {
    if (!canAddItem.value) return
    trueFalse.value.items.push(newItem())
  }

  // Пути ошибок привязаны к индексам: после удаления они указали бы на чужие утверждения
  function removeItem(index: number): void {
    if (!canRemoveItem.value) return
    trueFalse.value.items.splice(index, 1)
    fieldErrors.value = {}
  }

  function setAnswer(index: number, answer: boolean): void {
    const item = trueFalse.value.items[index]
    if (!item) return
    item.answer = answer
    const key = `items.${index}.answer`
    if (!fieldErrors.value[key]) return
    const { [key]: _resolved, ...rest } = fieldErrors.value
    fieldErrors.value = rest
    if (Object.keys(rest).length === 0) saveStatus.value = 'idle'
  }

  function errorOf(path: string): FieldError | undefined {
    return fieldErrors.value[path]
  }

  function apply(response: TrueFalseResponse): void {
    const input = toTrueFalseDraft(response.trueFalse)
    trueFalse.value = input
    id.value = response.trueFalse.id
    shareToken.value = response.trueFalse.shareToken
    savedSnapshot.value = snapshotOf(input)
    loadStatus.value = 'ready'
  }

  async function load(trueFalseId: string): Promise<void> {
    loadStatus.value = 'loading'
    const startedEpoch = epoch
    try {
      const response = await authorizedRequest((accessToken) => trueFalseApi.get(trueFalseId, accessToken))
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
    const parsed = trueFalseInputSchema.safeParse(trueFalse.value)
    const missingAnswers = missingAnswerErrors(trueFalse.value.items)
    if (!parsed.success || Object.keys(missingAnswers).length > 0) {
      const issues = parsed.success ? {} : issuesToFieldErrors(parsed.error.issues)
      showFieldErrors({ ...issues, ...missingAnswers })
      return false
    }
    fieldErrors.value = {}
    saveStatus.value = 'saving'
    const startedEpoch = epoch
    const input = cloneTrueFalse(parsed.data)
    try {
      const currentId = id.value
      const response = await authorizedRequest((accessToken) =>
        currentId === null ? trueFalseApi.create(input, accessToken) : trueFalseApi.update(currentId, input, accessToken),
      )
      if (startedEpoch !== epoch) return false
      id.value = response.trueFalse.id
      shareToken.value = response.trueFalse.shareToken
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
    fieldErrors.value = markDuplicateItems(trueFalse.value.items, errors)
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
    trueFalse.value = newTrueFalse()
    id.value = null
    shareToken.value = null
    view.value = 'items'
    loadStatus.value = 'idle'
    saveStatus.value = 'idle'
    fieldErrors.value = {}
    handoverId.value = null
    epoch++
    savedSnapshot.value = JSON.stringify(trueFalse.value)
  }

  return {
    trueFalse,
    items,
    id,
    shareToken,
    view,
    loadStatus,
    saveStatus,
    fieldErrors,
    isDirty,
    canAddItem,
    canRemoveItem,
    invalidItems,
    handoverId,
    addItem,
    removeItem,
    setAnswer,
    errorOf,
    load,
    save,
    reset,
  }
})
